import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as exifr from 'exifr';
import * as sharp from 'sharp';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const THUMB_MAX_EDGE = 480;
const THUMB_JPEG_QUALITY = 72;
const MAX_IMAGE_BYTES_FOR_THUMB = 40 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 45_000;

type ThumbSource = {
  id: string;
  tripId: string;
  contentHash: string;
  url: string;
  mimeType: string;
  size: bigint | number;
  originalFilename: string;
  kind: string;
  thumbUrl: string | null;
  takenAt?: Date | null;
  cameraModel?: string | null;
  width?: number | null;
  height?: number | null;
  exif?: Prisma.JsonValue | null;
};

type CaptureMeta = {
  takenAt?: Date | null;
  cameraModel?: string | null;
  width?: number | null;
  height?: number | null;
  exif?: Prisma.InputJsonObject;
};

@Injectable()
export class TripThumbsService {
  private readonly logger = new Logger(TripThumbsService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /** Generate thumb if missing and backfill capture metadata when possible. */
  async ensureThumb(media: ThumbSource): Promise<string | null> {
    try {
      if (media.kind === 'video') {
        return await this.ensureVideoThumbAndMeta(media);
      }
      return await this.ensurePhotoThumbAndMeta(media);
    } catch (error) {
      this.logger.warn(
        `Trip thumb/meta failed for ${media.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return media.thumbUrl;
    }
  }

  /** Fire-and-forget after upload so the API can respond quickly. */
  generateInBackground(media: ThumbSource): void {
    void this.ensureThumb(media);
  }

  private needsCaptureMeta(media: ThumbSource): boolean {
    return media.cameraModel == null || media.exif == null;
  }

  private async ensurePhotoThumbAndMeta(
    media: ThumbSource,
  ): Promise<string | null> {
    if (media.thumbUrl && !this.needsCaptureMeta(media)) {
      return media.thumbUrl;
    }

    const size = Number(media.size);
    const tooLarge = Number.isFinite(size) && size > MAX_IMAGE_BYTES_FOR_THUMB;
    if (tooLarge && media.thumbUrl && !this.needsCaptureMeta(media)) {
      return media.thumbUrl;
    }

    if (tooLarge && !media.thumbUrl && !this.needsCaptureMeta(media)) {
      this.logger.warn(
        `Skip image thumb for ${media.id}: ${size} bytes too large`,
      );
      return media.thumbUrl;
    }

    if (tooLarge && this.needsCaptureMeta(media) && media.thumbUrl) {
      // Too big to re-download just for EXIF — mark inspected.
      await this.prisma.tripMedia.update({
        where: { id: media.id },
        data: {
          cameraModel: media.cameraModel ?? '',
          exif: media.exif ?? {},
        },
      });
      return media.thumbUrl;
    }

    if (tooLarge) {
      this.logger.warn(
        `Skip image thumb for ${media.id}: ${size} bytes too large`,
      );
      if (this.needsCaptureMeta(media)) {
        await this.prisma.tripMedia.update({
          where: { id: media.id },
          data: {
            cameraModel: media.cameraModel ?? '',
            exif: media.exif ?? {},
          },
        });
      }
      return media.thumbUrl;
    }

    const key = this.storage.getTripMediaKey(
      media.tripId,
      media.contentHash,
      media.originalFilename,
    );
    const original = await this.storage.downloadByKey(key);
    const capture = this.needsCaptureMeta(media)
      ? await this.readImageCaptureMeta(original)
      : {};

    let thumbUrl = media.thumbUrl;
    if (!thumbUrl) {
      const jpeg = await sharp(original)
        .rotate()
        .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      thumbUrl = await this.storage.uploadTripThumb(
        media.tripId,
        media.contentHash,
        jpeg,
      );
    }

    // cameraModel '' / exif {} means "inspected, none" so list won't re-scan.
    await this.prisma.tripMedia.update({
      where: { id: media.id },
      data: {
        thumbUrl,
        ...(this.needsCaptureMeta(media)
          ? {
              takenAt: media.takenAt ?? capture.takenAt ?? undefined,
              cameraModel: media.cameraModel ?? capture.cameraModel ?? '',
              width: media.width ?? capture.width ?? undefined,
              height: media.height ?? capture.height ?? undefined,
              exif: capture.exif ?? {},
            }
          : {}),
      },
    });
    return thumbUrl;
  }

  private async ensureVideoThumbAndMeta(
    media: ThumbSource,
  ): Promise<string | null> {
    if (media.thumbUrl && !this.needsCaptureMeta(media)) {
      return media.thumbUrl;
    }

    let thumbUrl = media.thumbUrl;
    if (!thumbUrl) {
      try {
        const jpeg = await this.thumbFromVideoUrl(media.url);
        if (jpeg?.length) {
          thumbUrl = await this.storage.uploadTripThumb(
            media.tripId,
            media.contentHash,
            jpeg,
          );
        }
      } catch (error) {
        // Audio-only / odd QuickTime exports still have capture tags — don't
        // skip metadata just because ffmpeg couldn't pull a frame.
        this.logger.warn(
          `Trip video thumb failed for ${media.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const needsMeta = this.needsCaptureMeta(media);
    const capture = needsMeta ? await this.readVideoCaptureMeta(media.url) : {};

    await this.prisma.tripMedia.update({
      where: { id: media.id },
      data: {
        ...(thumbUrl ? { thumbUrl } : {}),
        // Prefer freshly probed capture date — iPhone creation_time is often
        // export/upload time, while com.apple.quicktime.creationdate is real.
        ...(needsMeta
          ? {
              takenAt: capture.takenAt ?? media.takenAt ?? undefined,
              cameraModel: media.cameraModel ?? capture.cameraModel ?? '',
              exif: capture.exif ?? {},
            }
          : {}),
      },
    });
    return thumbUrl;
  }

  private async readImageCaptureMeta(buffer: Buffer): Promise<CaptureMeta> {
    const meta: CaptureMeta = { exif: {} };
    try {
      const image = sharp(buffer);
      const sharpMeta = await image.metadata();
      if (sharpMeta.width) meta.width = sharpMeta.width;
      if (sharpMeta.height) meta.height = sharpMeta.height;
    } catch {
      // ignore
    }

    try {
      // Full EXIF for the lightbox; OffsetTime* keeps naive datetimes local.
      const exif = (await exifr.parse(buffer, {
        gps: true,
        icc: false,
        iptc: true,
        xmp: true,
        interop: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        sanitize: true,
        mergeOutput: true,
      })) as Record<string, unknown> | undefined;

      if (!exif) return meta;

      meta.exif = this.toJsonObject(exif);

      const taken =
        exif.DateTimeOriginal instanceof Date
          ? exif.DateTimeOriginal
          : exif.CreateDate instanceof Date
            ? exif.CreateDate
            : exif.ModifyDate instanceof Date
              ? exif.ModifyDate
              : null;
      if (taken && !Number.isNaN(taken.getTime())) meta.takenAt = taken;

      const make = typeof exif.Make === 'string' ? exif.Make.trim() : '';
      const model = typeof exif.Model === 'string' ? exif.Model.trim() : '';
      let camera = [make, model].filter(Boolean).join(' ');
      if (
        make &&
        model &&
        (model.toLowerCase().startsWith(make.toLowerCase()) ||
          make.toLowerCase() === 'apple')
      ) {
        camera = model;
      }
      if (camera) meta.cameraModel = camera.slice(0, 120);
    } catch {
      // Many phone formats still work via sharp rotate; EXIF optional.
    }
    return meta;
  }

  private async readVideoCaptureMeta(url: string): Promise<CaptureMeta> {
    try {
      const json = await this.runFfprobeJson(url);
      const tags = this.collectFfprobeTags(json);
      // iPhone: creation_time is often the export/share time; the real capture
      // date lives in com.apple.quicktime.creationdate (keys use dots, not _).
      const raw =
        this.ffprobeTag(tags, 'com.apple.quicktime.creationdate') ||
        this.ffprobeTag(tags, 'creation_time') ||
        this.ffprobeTag(tags, 'creation_date') ||
        this.ffprobeTag(tags, 'date') ||
        '';
      const takenAt = this.parseCaptureDate(raw);
      const make = this.ffprobeTag(tags, 'com.apple.quicktime.make', 'make');
      const model = this.ffprobeTag(tags, 'com.apple.quicktime.model', 'model');
      let camera = [make, model].filter(Boolean).join(' ');
      if (
        make &&
        model &&
        (model.toLowerCase().startsWith(make.toLowerCase()) ||
          make.toLowerCase() === 'apple')
      ) {
        camera = model;
      }

      const format = json.format || {};
      const streams = (json.streams || []).map((stream) => {
        const {
          index,
          codec_type: codecType,
          codec_name: codecName,
          width,
          height,
          duration,
          bit_rate: bitRate,
          tags: streamTags,
        } = stream as {
          index?: number;
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          duration?: string;
          bit_rate?: string;
          tags?: Record<string, string>;
        };
        return this.toJsonObject({
          index,
          codecType,
          codecName,
          width,
          height,
          duration,
          bitRate,
          ...(streamTags && Object.keys(streamTags).length
            ? { tags: streamTags }
            : {}),
        });
      });

      const exif = this.toJsonObject({
        ...tags,
        ...(typeof format.format_name === 'string'
          ? { formatName: format.format_name }
          : {}),
        ...(typeof format.duration === 'string'
          ? { duration: format.duration }
          : {}),
        ...(typeof format.size === 'string' ? { formatSize: format.size } : {}),
        ...(typeof format.bit_rate === 'string'
          ? { bitRate: format.bit_rate }
          : {}),
        ...(streams.length ? { streams } : {}),
      });

      return {
        takenAt,
        cameraModel: camera ? camera.slice(0, 120) : null,
        exif,
      };
    } catch {
      return { exif: {} };
    }
  }

  /** JSON-safe plain object for Prisma Json columns (Dates → ISO, drop junk). */
  private toJsonObject(value: unknown): Prisma.InputJsonObject {
    const seen = new WeakSet<object>();
    const walk = (input: unknown): Prisma.JsonValue => {
      if (input == null) return null;
      if (typeof input === 'string' || typeof input === 'boolean') return input;
      if (typeof input === 'number') {
        return Number.isFinite(input) ? input : String(input);
      }
      if (typeof input === 'bigint') return input.toString();
      if (input instanceof Date) {
        return Number.isNaN(input.getTime())
          ? String(input)
          : input.toISOString();
      }
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
        return `[binary ${input.length} bytes]`;
      }
      if (ArrayBuffer.isView(input)) {
        return `[binary ${(input as ArrayBufferView).byteLength} bytes]`;
      }
      if (Array.isArray(input)) {
        return input.map((item) => walk(item));
      }
      if (typeof input === 'object') {
        if (seen.has(input)) return '[circular]';
        seen.add(input);
        const out: Record<string, Prisma.JsonValue> = {};
        for (const [key, nested] of Object.entries(
          input as Record<string, unknown>,
        )) {
          if (typeof nested === 'function' || typeof nested === 'undefined') {
            continue;
          }
          out[key] = walk(nested);
        }
        return out;
      }
      return String(input);
    };
    const result = walk(value);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Prisma.InputJsonObject;
    }
    return {};
  }

  private collectFfprobeTags(json: {
    format?: {
      tags?: Record<string, string>;
      format_name?: string;
      duration?: string;
      size?: string;
      bit_rate?: string;
    };
    streams?: Array<{
      tags?: Record<string, string>;
      index?: number;
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      duration?: string;
      bit_rate?: string;
    }>;
  }): Record<string, string> {
    const out: Record<string, string> = {};
    const add = (tags?: Record<string, string>) => {
      if (!tags) return;
      for (const [key, value] of Object.entries(tags)) {
        if (typeof value === 'string' && value.trim()) {
          out[key] = value.trim();
        }
      }
    };
    add(json.format?.tags);
    for (const stream of json.streams || []) add(stream.tags);
    return out;
  }

  private ffprobeTag(tags: Record<string, string>, ...keys: string[]): string {
    for (const key of keys) {
      if (tags[key]) return tags[key];
      const lower = key.toLowerCase();
      for (const [candidate, value] of Object.entries(tags)) {
        if (candidate.toLowerCase() === lower) return value;
      }
    }
    return '';
  }

  private parseCaptureDate(raw: string): Date | null {
    if (!raw) return null;
    // ffprobe sometimes emits 6-digit fractional seconds.
    const normalized = raw.replace(
      /(\.\d{3})\d+(Z|[+-]\d{2}:?\d{2})?$/,
      '$1$2',
    );
    const takenAt = new Date(normalized);
    return Number.isNaN(takenAt.getTime()) ? null : takenAt;
  }

  private async thumbFromVideoUrl(url: string): Promise<Buffer | null> {
    const dir = await mkdtemp(join(tmpdir(), 'trip-thumb-'));
    const outPath = join(dir, 'thumb.jpg');
    try {
      await this.runFfmpeg([
        '-y',
        '-ss',
        '0.8',
        '-i',
        url,
        '-frames:v',
        '1',
        '-vf',
        `scale='min(${THUMB_MAX_EDGE},iw)':-2`,
        '-q:v',
        '5',
        outPath,
      ]);
      const frame = await readFile(outPath);
      return sharp(frame)
        .rotate()
        .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
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
        if (code === 0) resolve();
        else {
          const lastLine =
            stderr.trim().split('\n').filter(Boolean).pop() ||
            `ffmpeg exited with code ${code}`;
          reject(new Error(lastLine));
        }
      });
    });
  }

  private runFfprobeJson(url: string): Promise<{
    format?: {
      tags?: Record<string, string>;
      format_name?: string;
      duration?: string;
      size?: string;
      bit_rate?: string;
    };
    streams?: Array<{
      tags?: Record<string, string>;
      index?: number;
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      duration?: string;
      bit_rate?: string;
    }>;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'ffprobe',
        [
          '-v',
          'quiet',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          url,
        ],
        { timeout: FFMPEG_TIMEOUT_MS },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `ffprobe exited with ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}
