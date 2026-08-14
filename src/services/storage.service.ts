import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { createWriteStream } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

export type SubsAudioManifest = {
  hash: string;
  audioUrl: string;
  mimeType: string;
  size: number;
  waveform: number[];
  createdAt: string;
};

export type SubsTranscriptCue = {
  start: number;
  end: number;
  text: string;
};

export type SubsTranscriptWord = {
  start: number;
  end: number;
  word: string;
};

export type SubsAudioTranscript = {
  hash: string;
  language: string;
  model: string;
  text: string;
  cues: SubsTranscriptCue[];
  words: SubsTranscriptWord[];
  createdAt: string;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3;
  private readonly bucket = 'vlandivir-2025';
  private readonly endpoint = 'https://fra1.digitaloceanspaces.com';

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3({
      endpoint: this.endpoint,
      region: 'fra1',
      // Path-style URLs match public object URLs and the trip page CSP
      // (connect-src https://fra1.digitaloceanspaces.com). Virtual-hosted
      // https://vlandivir-2025.fra1.digitaloceanspaces.com is blocked by CSP.
      forcePathStyle: true,
      // Avoid CRC32 query params on presigned PUTs — browsers don't send them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId:
          this.configService.get<string>('DO_SPACES_ACCESS_KEY') || '',
        secretAccessKey:
          this.configService.get<string>('DO_SPACES_SECRET_KEY') || '',
      },
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists();
    await this.ensureTripUploadCors();
  }

  private async ensureBucketExists() {
    try {
      await this.s3.headBucket({ Bucket: this.bucket });
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFound') {
        await this.s3.createBucket({
          Bucket: this.bucket,
          ACL: 'public-read',
        });
        console.log(`Created bucket: ${this.bucket}`);
      } else {
        console.error('Error checking bucket:', error);
        throw error;
      }
    }
  }

  /** Allow browser PUT/GET of trip media from the site origins. */
  private async ensureTripUploadCors() {
    try {
      await this.s3.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [
                  'https://vlandivir.com',
                  'http://localhost:3000',
                  'http://127.0.0.1:3000',
                ],
                AllowedMethods: ['GET', 'PUT', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag', 'x-amz-request-id'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Could not set Spaces CORS (trip uploads may fail in browser): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  getTripMediaKey(
    tripId: string,
    contentHash: string,
    filename: string,
  ): string {
    const ext = this.extensionFromFilename(filename);
    return `trips/${tripId}/${contentHash}${ext}`;
  }

  getTripMediaPublicUrl(
    tripId: string,
    contentHash: string,
    filename: string,
  ): string {
    return this.getPublicUrl(
      this.getTripMediaKey(tripId, contentHash, filename),
    );
  }

  getTripThumbKey(tripId: string, contentHash: string): string {
    return `trips/${tripId}/${contentHash}.thumb.jpg`;
  }

  getTripThumbPublicUrl(tripId: string, contentHash: string): string {
    return this.getPublicUrl(this.getTripThumbKey(tripId, contentHash));
  }

  async uploadTripThumb(
    tripId: string,
    contentHash: string,
    jpeg: Buffer,
  ): Promise<string> {
    const key = this.getTripThumbKey(tripId, contentHash);
    return this.uploadFileWithKey(jpeg, 'image/jpeg', key);
  }

  async getTripMediaPresignedPutUrl(
    tripId: string,
    contentHash: string,
    filename: string,
    mimeType: string,
    expiresInSeconds = 3600,
  ): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
    const key = this.getTripMediaKey(tripId, contentHash, filename);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ACL: 'public-read',
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: expiresInSeconds,
    });
    return {
      uploadUrl,
      key,
      publicUrl: this.getPublicUrl(key),
    };
  }

  async headTripMedia(
    tripId: string,
    contentHash: string,
    filename: string,
  ): Promise<{ size: number; contentType?: string } | null> {
    const key = this.getTripMediaKey(tripId, contentHash, filename);
    try {
      const response = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (error) {
      if (this.isMissingObjectError(error)) return null;
      throw error;
    }
  }

  private extensionFromFilename(filename: string): string {
    const match = /\.([a-zA-Z0-9]{1,12})$/.exec(filename.trim());
    if (!match) return '';
    return `.${match[1].toLowerCase()}`;
  }

  async uploadFile(
    buffer: Buffer,
    mimeType: string,
    chatId: number,
  ): Promise<string> {
    const key = `chats/${chatId}/images/${uuidv4()}`;

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read',
      },
    });

    await upload.done();
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async uploadVideo(
    buffer: Buffer,
    mimeType: string,
    chatId: number,
  ): Promise<string> {
    const key = `chats/${chatId}/videos/${uuidv4()}`;

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read',
      },
    });

    await upload.done();
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async uploadVideoStream(
    stream: Readable,
    mimeType: string,
    chatId: number,
  ): Promise<string> {
    const key = `chats/${chatId}/videos/${uuidv4()}`;

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: mimeType,
        ACL: 'public-read',
      },
    });

    await upload.done();
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async uploadSubsVideoStream(
    stream: Readable,
    mimeType: string,
    hash: string,
  ): Promise<string> {
    const key = this.getSubsVideoKey(hash);

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: mimeType,
        ACL: 'public-read',
      },
    });

    await upload.done();
    return this.getPublicUrl(key);
  }

  async uploadSubsAudioStream(
    stream: Readable,
    mimeType: string,
    hash: string,
  ): Promise<string> {
    const key = this.getSubsAudioKey(hash);

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: mimeType,
        ACL: 'public-read',
      },
    });

    await upload.done();
    return this.getPublicUrl(key);
  }

  async uploadSubsRenderedVideoStream(
    stream: Readable,
    mimeType: string,
    hash: string,
  ): Promise<string> {
    const key = this.getSubsRenderedVideoKey(hash);

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: mimeType,
        ACL: 'public-read',
      },
    });

    await upload.done();
    return this.getPublicUrl(key);
  }

  async uploadSubsAudioManifest(
    hash: string,
    manifest: SubsAudioManifest,
  ): Promise<string> {
    const key = this.getSubsAudioManifestKey(hash);

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(manifest),
        ContentType: 'application/json',
        ACL: 'public-read',
      },
    });

    await upload.done();
    return this.getPublicUrl(key);
  }

  async getSubsAudioManifest(hash: string): Promise<SubsAudioManifest | null> {
    try {
      const response = await this.s3.getObject({
        Bucket: this.bucket,
        Key: this.getSubsAudioManifestKey(hash),
      });

      if (!response.Body) return null;

      const buffer = await this.readStreamToBuffer(
        response.Body as NodeJS.ReadableStream,
      );
      const manifest = JSON.parse(buffer.toString('utf8')) as unknown;

      if (!this.isSubsAudioManifest(manifest)) return null;
      return manifest;
    } catch (error) {
      if (this.isMissingObjectError(error)) return null;
      throw error;
    }
  }

  async uploadSubsAudioTranscript(
    hash: string,
    language: string,
    transcript: SubsAudioTranscript,
  ): Promise<string> {
    const key = this.getSubsAudioTranscriptKey(hash, language);

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(transcript),
        ContentType: 'application/json',
        ACL: 'public-read',
      },
    });

    await upload.done();
    return this.getPublicUrl(key);
  }

  async getSubsAudioTranscript(
    hash: string,
    language: string,
  ): Promise<SubsAudioTranscript | null> {
    try {
      const response = await this.s3.getObject({
        Bucket: this.bucket,
        Key: this.getSubsAudioTranscriptKey(hash, language),
      });

      if (!response.Body) return null;

      const buffer = await this.readStreamToBuffer(
        response.Body as NodeJS.ReadableStream,
      );
      const transcript = JSON.parse(buffer.toString('utf8')) as unknown;

      if (!this.isSubsAudioTranscript(transcript)) return null;
      return transcript;
    } catch (error) {
      if (this.isMissingObjectError(error)) return null;
      throw error;
    }
  }

  getSubsVideoUrl(hash: string): string {
    return this.getPublicUrl(this.getSubsVideoKey(hash));
  }

  getSubsAudioUrl(hash: string): string {
    return this.getPublicUrl(this.getSubsAudioKey(hash));
  }

  getSubsRenderedVideoUrl(hash: string): string {
    return this.getPublicUrl(this.getSubsRenderedVideoKey(hash));
  }

  async uploadStreamWithKey(
    stream: Readable,
    mimeType: string,
    key: string,
    options?: { contentDisposition?: string },
  ): Promise<string> {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: mimeType,
        ACL: 'public-read',
        ...(options?.contentDisposition
          ? { ContentDisposition: options.contentDisposition }
          : {}),
      },
    });
    await upload.done();
    return this.getPublicUrl(key);
  }

  // Private object (no public-read ACL) — for emails and other sensitive
  // content. Returns the key; read it back via downloadByKey().
  async uploadPrivateFileWithKey(
    buffer: Buffer,
    mimeType: string,
    key: string,
  ): Promise<string> {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'private',
      },
    });
    await upload.done();
    return key;
  }

  async downloadByKey(key: string): Promise<Buffer> {
    const response = await this.s3.getObject({
      Bucket: this.bucket,
      Key: key,
    });
    if (!response.Body) {
      throw new Error(`No body in response for key: ${key}`);
    }
    return this.readStreamToBuffer(response.Body as NodeJS.ReadableStream);
  }

  async uploadFileWithKey(
    buffer: Buffer,
    mimeType: string,
    key: string,
  ): Promise<string> {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ACL: 'public-read',
      },
    });
    await upload.done();
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  getTripProjectClipKey(
    tripId: string,
    projectId: number,
    clipId: number,
  ): string {
    return `trips/${tripId}/projects/${projectId}/${clipId}.mp4`;
  }

  getTripProjectZipKey(tripId: string, projectId: number): string {
    return `trips/${tripId}/projects/${projectId}/export.zip`;
  }

  async uploadTripProjectClip(
    tripId: string,
    projectId: number,
    clipId: number,
    buffer: Buffer,
  ): Promise<string> {
    return this.uploadFileWithKey(
      buffer,
      'video/mp4',
      this.getTripProjectClipKey(tripId, projectId, clipId),
    );
  }

  async deleteByPublicUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const key = this.keyFromPublicUrl(url);
    if (!key) return;
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      if (this.isMissingObjectError(error)) return;
      this.logger.warn(
        `Failed to delete Spaces object ${key}: ${String(error)}`,
      );
    }
  }

  private keyFromPublicUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const prefix = `/${this.bucket}/`;
      if (!parsed.pathname.startsWith(prefix)) return null;
      return decodeURIComponent(parsed.pathname.slice(prefix.length));
    } catch {
      return null;
    }
  }

  private getSubsVideoKey(hash: string): string {
    return `subs/videos/${hash}/source`;
  }

  private getSubsAudioKey(hash: string): string {
    return `subs/videos/${hash}/audio/audio.mp3`;
  }

  private getSubsAudioManifestKey(hash: string): string {
    return `subs/videos/${hash}/audio/waveform.json`;
  }

  private getSubsAudioTranscriptKey(hash: string, language: string): string {
    return `subs/videos/${hash}/audio/transcript-words-${this.normalizeStorageSegment(language)}.json`;
  }

  private getSubsRenderedVideoKey(hash: string): string {
    return `subs/videos/${hash}/renders/subtitled.mp4`;
  }

  private getPublicUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  private isSubsAudioManifest(value: unknown): value is SubsAudioManifest {
    if (!value || typeof value !== 'object') return false;

    const manifest = value as Partial<SubsAudioManifest>;
    return (
      typeof manifest.hash === 'string' &&
      typeof manifest.audioUrl === 'string' &&
      typeof manifest.mimeType === 'string' &&
      typeof manifest.size === 'number' &&
      typeof manifest.createdAt === 'string' &&
      Array.isArray(manifest.waveform) &&
      manifest.waveform.every((peak) => typeof peak === 'number')
    );
  }

  private isSubsAudioTranscript(value: unknown): value is SubsAudioTranscript {
    if (!value || typeof value !== 'object') return false;

    const transcript = value as Partial<SubsAudioTranscript>;
    return (
      typeof transcript.hash === 'string' &&
      typeof transcript.language === 'string' &&
      typeof transcript.model === 'string' &&
      typeof transcript.text === 'string' &&
      typeof transcript.createdAt === 'string' &&
      Array.isArray(transcript.cues) &&
      Array.isArray(transcript.words) &&
      transcript.cues.every(
        (cue) =>
          typeof cue?.start === 'number' &&
          typeof cue?.end === 'number' &&
          typeof cue?.text === 'string',
      ) &&
      transcript.words.every(
        (word) =>
          typeof word?.start === 'number' &&
          typeof word?.end === 'number' &&
          typeof word?.word === 'string',
      )
    );
  }

  private isMissingObjectError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
      error.name === 'NoSuchKey' ||
      error.name === 'NotFound' ||
      error.message.includes('NoSuchKey') ||
      error.message.includes('not found')
    );
  }

  private normalizeStorageSegment(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  }

  private async readStreamToBuffer(
    stream: NodeJS.ReadableStream,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  async downloadFile(url: string): Promise<Buffer> {
    try {
      const key = this.keyFromPublicUrl(url);
      if (!key) {
        throw new Error(`Could not parse Spaces key from URL: ${url}`);
      }

      const response = await this.s3.getObject({
        Bucket: this.bucket,
        Key: key,
      });

      if (!response.Body) {
        throw new Error('No body in response');
      }

      return this.readStreamToBuffer(response.Body as NodeJS.ReadableStream);
    } catch (error) {
      this.logger.error(`Error downloading file: ${String(error)}`);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to download file: ${errorMessage}`);
    }
  }

  /** Stream a Spaces object to a local path (avoids holding the whole file in RAM). */
  async downloadFileToPath(
    url: string,
    destPath: string,
  ): Promise<{ bytes: number }> {
    const key = this.keyFromPublicUrl(url);
    if (!key) {
      throw new Error(`Could not parse Spaces key from URL: ${url}`);
    }

    const response = await this.s3.getObject({
      Bucket: this.bucket,
      Key: key,
    });
    if (!response.Body) {
      throw new Error(`No body in response for key: ${key}`);
    }

    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        cb(null, chunk);
      },
    });

    await pipeline(
      response.Body as NodeJS.ReadableStream,
      counter,
      createWriteStream(destPath),
    );
    return { bytes };
  }
}
