import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { finished } from 'stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

type ExportStatus = {
  status: 'idle' | 'building' | 'ready' | 'error';
  url: string | null;
  error: string | null;
  progress: string | null;
  filename: string;
};

const MEDIA_SUMMARY_SELECT = {
  id: true,
  url: true,
  thumbUrl: true,
  originalFilename: true,
  kind: true,
  durationMs: true,
  size: true,
  mimeType: true,
  deletedAt: true,
} as const;

type MediaSummaryRow = {
  id: string;
  url: string;
  thumbUrl: string | null;
  originalFilename: string;
  kind: string;
  durationMs: number | null;
  size: bigint | number;
  mimeType: string;
  deletedAt: Date | null;
};

@Injectable()
export class TripProjectsService {
  private readonly logger = new Logger(TripProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async listProjects(tripId: string) {
    const projects = await this.prisma.tripProject.findMany({
      where: { tripId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { clips: true } } },
    });
    return projects.map(({ _count, ...project }) => ({
      ...project,
      clipCount: _count.clips,
    }));
  }

  async createProject(tripId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Нужно имя проекта');
    if (trimmed.length > 120) {
      throw new BadRequestException('Имя проекта слишком длинное');
    }
    return this.prisma.tripProject.create({
      data: { tripId, name: trimmed },
    });
  }

  async renameProject(tripId: string, projectId: number, name: string) {
    await this.requireProject(tripId, projectId);
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Нужно имя проекта');
    if (trimmed.length > 120) {
      throw new BadRequestException('Имя проекта слишком длинное');
    }
    return this.prisma.tripProject.update({
      where: { id: projectId },
      data: { name: trimmed },
    });
  }

  async deleteProject(tripId: string, projectId: number) {
    const project = await this.prisma.tripProject.findFirst({
      where: { id: projectId, tripId },
      include: { clips: { select: { trimmedVideoUrl: true } } },
    });
    if (!project) throw new NotFoundException('Проект не найден');

    for (const clip of project.clips) {
      await this.storageService.deleteByPublicUrl(clip.trimmedVideoUrl);
    }
    await this.storageService.deleteByPublicUrl(project.exportZipUrl);
    await this.prisma.tripProject.delete({ where: { id: projectId } });
    return { deleted: true };
  }

  async getProject(tripId: string, projectId: number) {
    const project = await this.prisma.tripProject.findFirst({
      where: { id: projectId, tripId },
      include: {
        clips: {
          orderBy: { position: 'asc' },
          include: { media: { select: MEDIA_SUMMARY_SELECT } },
        },
      },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    return this.serializeProject(project);
  }

  async addClip(tripId: string, projectId: number, mediaId: string) {
    await this.requireProject(tripId, projectId);
    const media = await this.prisma.tripMedia.findFirst({
      where: { id: mediaId, tripId, deletedAt: null },
    });
    if (!media) throw new NotFoundException('Видео не найдено');
    if (media.kind !== 'video') {
      throw new BadRequestException('В проект можно добавить только видео');
    }

    const max = await this.prisma.tripProjectClip.aggregate({
      where: { projectId },
      _max: { position: true },
    });
    const position = (max._max.position ?? -1) + 1;

    const clip = await this.prisma.tripProjectClip.create({
      data: { projectId, mediaId, position },
      include: { media: { select: MEDIA_SUMMARY_SELECT } },
    });
    await this.touchProject(projectId);
    return this.serializeClip(clip);
  }

  async removeClip(tripId: string, projectId: number, clipId: number) {
    const clip = await this.requireClip(tripId, projectId, clipId);
    await this.storageService.deleteByPublicUrl(clip.trimmedVideoUrl);
    await this.prisma.tripProjectClip.delete({ where: { id: clipId } });
    await this.reindexPositions(projectId);
    await this.touchProject(projectId);
    return { deleted: true };
  }

  async reorderClips(tripId: string, projectId: number, clipIds: number[]) {
    await this.requireProject(tripId, projectId);
    if (!Array.isArray(clipIds) || clipIds.length === 0) {
      throw new BadRequestException('Нужен массив clipIds');
    }
    if (clipIds.some((id) => !Number.isInteger(id))) {
      throw new BadRequestException('clipIds должны быть целыми числами');
    }

    const existing = await this.prisma.tripProjectClip.findMany({
      where: { projectId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((c) => c.id));
    if (
      clipIds.length !== existingIds.size ||
      clipIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'clipIds должны содержать все клипы проекта ровно один раз',
      );
    }

    await this.prisma.$transaction(
      clipIds.map((id, position) =>
        this.prisma.tripProjectClip.update({
          where: { id },
          data: { position },
        }),
      ),
    );
    await this.touchProject(projectId);
    return this.getProject(tripId, projectId);
  }

  async updateClipTrim(
    tripId: string,
    projectId: number,
    clipId: number,
    trimStartSec: number | null | undefined,
    trimEndSec: number | null | undefined,
  ) {
    const clip = await this.requireClip(tripId, projectId, clipId);
    const media = await this.prisma.tripMedia.findUnique({
      where: { id: clip.mediaId },
    });
    if (!media) throw new NotFoundException('Видео не найдено');

    const durationSec =
      media.durationMs != null ? media.durationMs / 1000 : undefined;
    const nextStart =
      trimStartSec === undefined ? clip.trimStartSec : trimStartSec;
    const nextEnd = trimEndSec === undefined ? clip.trimEndSec : trimEndSec;
    this.assertTrimRange(nextStart, nextEnd, durationSec);

    if (clip.trimmedVideoUrl) {
      await this.storageService.deleteByPublicUrl(clip.trimmedVideoUrl);
    }

    const updated = await this.prisma.tripProjectClip.update({
      where: { id: clipId },
      data: {
        trimStartSec: nextStart,
        trimEndSec: nextEnd,
        trimmedVideoUrl: null,
      },
      include: { media: { select: MEDIA_SUMMARY_SELECT } },
    });
    await this.touchProject(projectId);
    return this.serializeClip(updated);
  }

  async applyTrim(tripId: string, projectId: number, clipId: number) {
    const clip = await this.requireClip(tripId, projectId, clipId);
    const media = await this.prisma.tripMedia.findUnique({
      where: { id: clip.mediaId },
    });
    if (!media?.url) {
      throw new BadRequestException('У клипа нет видео');
    }
    if (clip.trimStartSec == null && clip.trimEndSec == null) {
      throw new BadRequestException('Сначала задайте границы обрезки');
    }
    const durationSec =
      media.durationMs != null ? media.durationMs / 1000 : undefined;
    this.assertTrimRange(clip.trimStartSec, clip.trimEndSec, durationSec);

    const trimmedUrl = await this.trimAndUpload(
      tripId,
      projectId,
      clipId,
      media.url,
      clip.trimStartSec,
      clip.trimEndSec,
    );

    if (clip.trimmedVideoUrl && clip.trimmedVideoUrl !== trimmedUrl) {
      await this.storageService.deleteByPublicUrl(clip.trimmedVideoUrl);
    }

    const updated = await this.prisma.tripProjectClip.update({
      where: { id: clipId },
      data: { trimmedVideoUrl: trimmedUrl },
      include: { media: { select: MEDIA_SUMMARY_SELECT } },
    });
    await this.touchProject(projectId);
    return this.serializeClip(updated);
  }

  async getExportStatus(
    tripId: string,
    projectId: number,
  ): Promise<ExportStatus> {
    const project = await this.requireProject(tripId, projectId);
    return this.toExportStatus(project);
  }

  /**
   * Start ZIP build in the background and return immediately.
   * Large albums OOM'd / timed out when the HTTP request held all clips in RAM.
   */
  async startExportZip(
    tripId: string,
    projectId: number,
  ): Promise<ExportStatus> {
    const project = await this.getProject(tripId, projectId);
    if (!project.clips.length) {
      throw new BadRequestException('В проекте нет клипов');
    }

    if (project.exportZipStatus === 'building') {
      this.logger.log(
        `ZIP export already building for project ${projectId} (${project.exportZipProgress || '?'})`,
      );
      return this.toExportStatus(project);
    }

    const total = project.clips.length;
    this.logger.log(
      `ZIP export requested for project ${projectId} «${project.name}»: ${total} clips`,
    );

    if (project.exportZipUrl) {
      await this.storageService.deleteByPublicUrl(project.exportZipUrl);
    }

    const updated = await this.prisma.tripProject.update({
      where: { id: projectId },
      data: {
        exportZipStatus: 'building',
        exportZipError: null,
        exportZipProgress: `0/${total}`,
        exportZipUrl: null,
      },
    });

    void this.buildExportZip(tripId, projectId).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `ZIP export failed for project ${projectId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      try {
        await this.prisma.tripProject.update({
          where: { id: projectId },
          data: {
            exportZipStatus: 'error',
            exportZipError: message.slice(0, 500),
            exportZipProgress: null,
          },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to persist ZIP export error for project ${projectId}: ${String(updateError)}`,
        );
      }
    });

    return this.toExportStatus(updated);
  }

  private async buildExportZip(
    tripId: string,
    projectId: number,
  ): Promise<void> {
    const startedAt = Date.now();
    const project = await this.getProject(tripId, projectId);
    const total = project.clips.length;
    this.logger.log(
      `ZIP export build start project=${projectId} clips=${total}`,
    );

    for (let i = 0; i < project.clips.length; i++) {
      const clip = project.clips[i];
      const needsTrim =
        (clip.trimStartSec != null || clip.trimEndSec != null) &&
        !clip.trimmedVideoUrl;
      if (!needsTrim) continue;
      if (!clip.media.url) {
        throw new BadRequestException(
          `У клипа #${clip.id} нет исходного видео`,
        );
      }
      this.logger.log(
        `ZIP export trim clip ${clip.id} (${i + 1}/${total}) start=${clip.trimStartSec} end=${clip.trimEndSec}`,
      );
      const trimStarted = Date.now();
      const trimmedUrl = await this.trimAndUpload(
        tripId,
        projectId,
        clip.id,
        clip.media.url,
        clip.trimStartSec,
        clip.trimEndSec,
      );
      await this.prisma.tripProjectClip.update({
        where: { id: clip.id },
        data: { trimmedVideoUrl: trimmedUrl },
      });
      clip.trimmedVideoUrl = trimmedUrl;
      this.logger.log(
        `ZIP export trim clip ${clip.id} done in ${Date.now() - trimStarted}ms`,
      );
    }

    const filename = this.exportFilename(project.name, project.id);
    const key = this.storageService.getTripProjectZipKey(tripId, projectId);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'trip-zip-'));
    const zipPath = path.join(tempDir, 'export.zip');

    try {
      const archive = new ZipArchive({ store: true });
      const output = createWriteStream(zipPath);
      const outputDone = finished(output);
      archive.on('error', (error) => {
        this.logger.error(`ZIP archive error: ${String(error)}`);
        output.destroy(error);
      });
      archive.pipe(output);

      const pad = String(total).length;
      let downloadedBytes = 0;

      for (let i = 0; i < project.clips.length; i++) {
        const clip = project.clips[i];
        const sourceUrl = clip.trimmedVideoUrl || clip.media.url;
        if (!sourceUrl) {
          throw new BadRequestException(
            `У клипа #${clip.id} нет видео для экспорта`,
          );
        }

        const progress = `${i + 1}/${total}`;
        await this.prisma.tripProject.update({
          where: { id: projectId },
          data: { exportZipProgress: progress },
        });

        const clipPath = path.join(tempDir, `${clip.id}.mp4`);
        const dlStarted = Date.now();
        const { bytes } = await this.storageService.downloadFileToPath(
          sourceUrl,
          clipPath,
        );
        downloadedBytes += bytes;
        this.logger.log(
          `ZIP export downloaded clip ${clip.id} ${progress} ${this.formatBytes(bytes)} in ${Date.now() - dlStarted}ms`,
        );

        const index = String(i + 1).padStart(Math.max(2, pad), '0');
        const base = (clip.media.originalFilename || `clip-${clip.id}`)
          .replace(/\.[^.]+$/, '')
          .replace(/[^A-Za-z0-9_-]+/g, '_')
          .slice(0, 60);
        archive.append(createReadStream(clipPath), {
          name: `${index}-${base || clip.id}.mp4`,
        });
      }

      this.logger.log(
        `ZIP export finalizing archive project=${projectId} clipsBytes=${this.formatBytes(downloadedBytes)}`,
      );
      await this.prisma.tripProject.update({
        where: { id: projectId },
        data: { exportZipProgress: `zip/${total}` },
      });
      await archive.finalize();
      await outputDone;

      const zipStat = await stat(zipPath);
      this.logger.log(
        `ZIP export archive ready project=${projectId} size=${this.formatBytes(zipStat.size)}; uploading to Spaces…`,
      );

      await this.prisma.tripProject.update({
        where: { id: projectId },
        data: { exportZipProgress: `upload/${total}` },
      });
      const uploadStarted = Date.now();
      const url = await this.storageService.uploadStreamWithKey(
        createReadStream(zipPath),
        'application/zip',
        key,
        { contentDisposition: `attachment; filename="${filename}"` },
      );
      this.logger.log(
        `ZIP export uploaded project=${projectId} in ${Date.now() - uploadStarted}ms url=${url}`,
      );

      await this.prisma.tripProject.update({
        where: { id: projectId },
        data: {
          exportZipUrl: url,
          exportZipStatus: 'ready',
          exportZipError: null,
          exportZipProgress: null,
        },
      });
      this.logger.log(
        `ZIP export complete project=${projectId} in ${Date.now() - startedAt}ms`,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private toExportStatus(project: {
    id: number;
    name: string;
    exportZipUrl?: string | null;
    exportZipStatus?: string | null;
    exportZipError?: string | null;
    exportZipProgress?: string | null;
  }): ExportStatus {
    const status =
      project.exportZipStatus === 'building' ||
      project.exportZipStatus === 'ready' ||
      project.exportZipStatus === 'error'
        ? project.exportZipStatus
        : project.exportZipUrl
          ? 'ready'
          : 'idle';
    return {
      status,
      url: project.exportZipUrl || null,
      error: project.exportZipError || null,
      progress: project.exportZipProgress || null,
      filename: this.exportFilename(project.name, project.id),
    };
  }

  private exportFilename(name: string, projectId: number): string {
    const asciiName =
      name
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]+/g, '')
        .replace(/[^A-Za-z0-9._ -]+/g, '_')
        .trim()
        .slice(0, 80) || `project-${projectId}`;
    return `${asciiName}.zip`;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  }

  private async trimAndUpload(
    tripId: string,
    projectId: number,
    clipId: number,
    sourceUrl: string,
    trimStartSec: number | null,
    trimEndSec: number | null,
  ): Promise<string> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'trip-trim-'));
    const inputPath = path.join(tempDir, 'input.mp4');
    const outputPath = path.join(tempDir, 'output.mp4');
    try {
      const source = await this.storageService.downloadFile(sourceUrl);
      await writeFile(inputPath, source);

      const start = trimStartSec != null && trimStartSec > 0 ? trimStartSec : 0;
      const args = ['-y', '-hide_banner', '-loglevel', 'error'];
      if (start > 0) args.push('-ss', String(start));
      args.push('-i', inputPath);
      if (trimEndSec != null) {
        args.push('-t', String(Math.max(0.05, trimEndSec - start)));
      }
      args.push('-c', 'copy', '-movflags', '+faststart', outputPath);

      await this.runFfmpeg(args);
      const trimmed = await readFile(outputPath);
      if (!trimmed.length) {
        throw new Error('ffmpeg produced an empty file');
      }
      return this.storageService.uploadTripProjectClip(
        tripId,
        projectId,
        clipId,
        trimmed,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private assertTrimRange(
    start: number | null | undefined,
    end: number | null | undefined,
    duration?: number,
  ) {
    if (start != null) {
      if (!Number.isFinite(start) || start < 0) {
        throw new BadRequestException('trimStartSec должен быть ≥ 0');
      }
    }
    if (end != null) {
      if (!Number.isFinite(end) || end <= 0) {
        throw new BadRequestException('trimEndSec должен быть > 0');
      }
    }
    if (start != null && end != null && end <= start) {
      throw new BadRequestException(
        'trimEndSec должен быть больше trimStartSec',
      );
    }
    if (duration != null && Number.isFinite(duration)) {
      if (start != null && start >= duration) {
        throw new BadRequestException('trimStartSec за пределами ролика');
      }
      if (end != null && end > duration + 0.25) {
        throw new BadRequestException('trimEndSec за пределами ролика');
      }
    }
  }

  private serializeMediaSummary(media: MediaSummaryRow) {
    return {
      ...media,
      size: Number(media.size),
    };
  }

  private serializeClip<T extends { media?: MediaSummaryRow | null }>(clip: T) {
    if (!clip.media) return clip;
    return {
      ...clip,
      media: this.serializeMediaSummary(clip.media),
    };
  }

  private serializeProject<
    T extends { clips: Array<{ media?: MediaSummaryRow | null }> },
  >(project: T) {
    return {
      ...project,
      clips: project.clips.map((clip) => this.serializeClip(clip)),
    };
  }

  private async requireProject(tripId: string, projectId: number) {
    const project = await this.prisma.tripProject.findFirst({
      where: { id: projectId, tripId },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    return project;
  }

  private async requireClip(tripId: string, projectId: number, clipId: number) {
    await this.requireProject(tripId, projectId);
    const clip = await this.prisma.tripProjectClip.findFirst({
      where: { id: clipId, projectId },
    });
    if (!clip) throw new NotFoundException('Клип не найден');
    return clip;
  }

  private async reindexPositions(projectId: number) {
    const clips = await this.prisma.tripProjectClip.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    await this.prisma.$transaction(
      clips.map((clip, position) =>
        this.prisma.tripProjectClip.update({
          where: { id: clip.id },
          data: { position },
        }),
      ),
    );
  }

  private async touchProject(id: number) {
    const project = await this.prisma.tripProject.findUnique({
      where: { id },
      select: {
        exportZipUrl: true,
        exportZipStatus: true,
      },
    });
    // Don't wipe a running build mid-flight from clip edits in another tab —
    // only clear ready/error/idle artifacts. Building jobs own their own state.
    if (project?.exportZipStatus === 'building') {
      await this.prisma.tripProject.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      return;
    }
    if (project?.exportZipUrl) {
      await this.storageService.deleteByPublicUrl(project.exportZipUrl);
    }
    await this.prisma.tripProject.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        exportZipUrl: null,
        exportZipStatus: null,
        exportZipError: null,
        exportZipProgress: null,
      },
    });
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args, { timeout: FFMPEG_TIMEOUT_MS });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error('ffmpeg is not installed on the server'));
        } else {
          reject(error);
        }
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const lastLine =
            stderr.trim().split('\n').filter(Boolean).pop() ||
            `ffmpeg exited with code ${code}`;
          reject(new Error(lastLine));
        }
      });
    });
  }
}
