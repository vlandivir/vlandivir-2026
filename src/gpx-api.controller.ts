import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { stat, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import type { Request } from 'express';
import { StorageService } from './services/storage.service';
import { ToolPagesService } from './services/tool-pages.service';
import type { ToolArtifact, ToolPageManifest } from './services/tool-pages.types';

type MulterDiskFile = {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
};

const MAX_GPX_BYTES = 50 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const ARTIFACT_IDS = new Set([
  'source',
  'poster',
  'track-alpha',
  'animation',
  'frames',
  'source-video',
  'final-video',
]);

@Controller('gpx-api')
export class GpxApiController {
  constructor(
    private readonly storage: StorageService,
    private readonly toolPages: ToolPagesService,
  ) {}

  @Post('projects')
  @UseInterceptors(
    FileInterceptor('gpx', {
      dest: tmpdir(),
      limits: { fileSize: MAX_GPX_BYTES },
      fileFilter: (_req, file, callback) => {
        const name = file.originalname.toLowerCase();
        const type = (file.mimetype || '').toLowerCase();
        if (
          name.endsWith('.gpx') ||
          type === 'application/gpx+xml' ||
          type === 'text/xml' ||
          type === 'application/xml'
        ) {
          callback(null, true);
          return;
        }
        callback(new BadRequestException('Only GPX files are supported'), false);
      },
    }),
  )
  async createProject(
    @UploadedFile() file: MulterDiskFile | undefined,
    @Req() request: Request,
  ): Promise<ToolPageManifest> {
    if (!file) throw new BadRequestException('GPX file is required');
    const hash = this.toolPages.createHash();
    const filename = file.originalname || 'track.gpx';
    try {
      const key = this.toolPages.artifactKey('gpx', hash, 'source', filename);
      const url = await this.storage.uploadStreamWithKey(
        createReadStream(file.path),
        file.mimetype || 'application/gpx+xml',
        key,
      );
      const artifact = this.toolPages.artifactFromUpload({
        id: 'source',
        name: filename,
        url,
        mimeType: file.mimetype || 'application/gpx+xml',
        size: file.size,
      });
      const title = filename.replace(/\.gpx$/i, '') || hash;
      const pageUrl = `/gpx-route-png/${hash}`;
      const manifest = await this.toolPages.createManifest({
        kind: 'gpx',
        hash,
        title,
        pageUrl,
        artifact,
      });
      await this.toolPages.recordPageForRequest(
        request,
        this.toolPages.toUserPage(manifest),
      );
      return manifest;
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Get('projects/:hash')
  async getProject(@Param('hash') hash: string): Promise<ToolPageManifest> {
    this.toolPages.assertHash(hash);
    const manifest = await this.toolPages.getManifest('gpx', hash);
    if (!manifest) throw new NotFoundException('GPX project not found');
    return manifest;
  }

  @Post('projects/:hash/artifacts')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: tmpdir(),
      limits: { fileSize: MAX_ARTIFACT_BYTES },
    }),
  )
  async uploadArtifact(
    @Param('hash') hash: string,
    @Body() body: { id?: string; name?: string },
    @UploadedFile() file: MulterDiskFile | undefined,
    @Req() request: Request,
  ): Promise<ToolPageManifest> {
    this.toolPages.assertHash(hash);
    if (!file) throw new BadRequestException('File is required');
    const id = (body.id || '').trim();
    if (!ARTIFACT_IDS.has(id)) {
      throw new BadRequestException('Unknown artifact id');
    }
    const existing = await this.toolPages.getManifest('gpx', hash);
    if (!existing) throw new NotFoundException('GPX project not found');

    const filename = (body.name || file.originalname || id).slice(0, 180);
    try {
      const key = this.toolPages.artifactKey('gpx', hash, id, filename);
      const url = await this.storage.uploadStreamWithKey(
        createReadStream(file.path),
        file.mimetype || 'application/octet-stream',
        key,
      );
      const stats = await stat(file.path).catch(() => ({ size: file.size }));
      const artifact: ToolArtifact = this.toolPages.artifactFromUpload({
        id,
        name: filename,
        url,
        mimeType: file.mimetype || 'application/octet-stream',
        size: stats.size || file.size,
      });
      const manifest = await this.toolPages.upsertArtifact(
        'gpx',
        hash,
        artifact,
      );
      await this.toolPages.recordPageForRequest(
        request,
        this.toolPages.toUserPage(manifest),
      );
      return manifest;
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }
}
