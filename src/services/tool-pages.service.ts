import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { StorageService } from './storage.service';
import type {
  ToolArtifact,
  ToolKind,
  ToolPageManifest,
  UserToolPage,
} from './tool-pages.types';

const HASH_RE = /^[a-f0-9]{24}$/;
const MAX_USER_PAGES = 200;

@Injectable()
export class ToolPagesService {
  private readonly logger = new Logger(ToolPagesService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly auth: AuthService,
  ) {}

  createHash(): string {
    return randomBytes(12).toString('hex');
  }

  assertHash(hash: string): void {
    if (!HASH_RE.test(hash)) {
      throw new BadRequestException('Invalid page hash');
    }
  }

  manifestKey(kind: ToolKind, hash: string): string {
    return `${this.prefix(kind)}/${hash}/manifest.json`;
  }

  artifactKey(
    kind: ToolKind,
    hash: string,
    artifactId: string,
    filename?: string,
  ): string {
    if (kind === 'subs') {
      if (artifactId === 'source') return `subs/videos/${hash}/source`;
      if (artifactId === 'audio') return `subs/videos/${hash}/audio/audio.mp3`;
      if (artifactId === 'waveform')
        return `subs/videos/${hash}/audio/waveform.json`;
      if (artifactId === 'ass') return `subs/videos/${hash}/subtitles.ass`;
      if (artifactId === 'render')
        return `subs/videos/${hash}/renders/subtitled.mp4`;
      if (artifactId.startsWith('transcript-')) {
        const language = artifactId.slice('transcript-'.length);
        return `subs/videos/${hash}/audio/transcript-words-${this.normalize(language)}.json`;
      }
      if (artifactId.startsWith('translation-')) {
        const language = artifactId.slice('translation-'.length);
        return `subs/videos/${hash}/audio/translation-${this.normalize(language)}.json`;
      }
    }
    const ext = this.extensionFromFilename(filename || artifactId);
    return `gpx/projects/${hash}/${artifactId}${ext}`;
  }

  async getManifest(
    kind: ToolKind,
    hash: string,
  ): Promise<ToolPageManifest | null> {
    const manifest = await this.storage.getJsonByKey<ToolPageManifest>(
      this.manifestKey(kind, hash),
    );
    if (manifest && Array.isArray(manifest.artifacts)) return manifest;
    return null;
  }

  async createManifest(input: {
    kind: ToolKind;
    hash: string;
    title: string;
    pageUrl: string;
    artifact?: ToolArtifact;
  }): Promise<ToolPageManifest> {
    const now = new Date().toISOString();
    const manifest: ToolPageManifest = {
      kind: input.kind,
      hash: input.hash,
      title: input.title,
      pageUrl: input.pageUrl,
      createdAt: now,
      updatedAt: now,
      artifacts: input.artifact ? [input.artifact] : [],
    };
    await this.storage.putPublicJson(
      this.manifestKey(input.kind, input.hash),
      manifest,
    );
    return manifest;
  }

  async upsertArtifact(
    kind: ToolKind,
    hash: string,
    artifact: ToolArtifact,
    meta?: { title?: string; pageUrl?: string },
  ): Promise<ToolPageManifest> {
    const existing = await this.getManifest(kind, hash);
    const now = new Date().toISOString();
    const artifacts = existing
      ? existing.artifacts.filter((item) => item.id !== artifact.id)
      : [];
    artifacts.push(artifact);
    artifacts.sort((a, b) => a.id.localeCompare(b.id));
    const manifest: ToolPageManifest = {
      kind,
      hash,
      title: meta?.title || existing?.title || hash,
      pageUrl: meta?.pageUrl || existing?.pageUrl || this.defaultPageUrl(kind, hash),
      createdAt: existing?.createdAt || artifact.createdAt || now,
      updatedAt: now,
      artifacts,
    };
    await this.storage.putPublicJson(this.manifestKey(kind, hash), manifest);
    return manifest;
  }

  artifactFromUpload(input: {
    id: string;
    name: string;
    url: string;
    mimeType: string;
    size: number;
    createdAt?: string;
  }): ToolArtifact {
    return {
      id: input.id,
      name: input.name,
      url: input.url,
      mimeType: input.mimeType,
      size: input.size,
      createdAt: input.createdAt || new Date().toISOString(),
    };
  }

  async recordPageForRequest(
    request: Request,
    page: UserToolPage,
  ): Promise<void> {
    const user = this.auth.getSessionFromRequest(request);
    if (!user) return;
    try {
      await this.upsertUserPage(user.email, page);
    } catch (error) {
      this.logger.warn(
        `Failed to record ${page.kind} page ${page.hash} for ${user.email}: ${String(error)}`,
      );
    }
  }

  async listUserPages(email: string): Promise<UserToolPage[]> {
    const stored = await this.storage.getJsonByKey<{ pages?: UserToolPage[] }>(
      this.userPagesKey(email),
    );
    const pages = Array.isArray(stored?.pages) ? stored.pages : [];
    return pages.sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
  }

  async upsertUserPage(email: string, page: UserToolPage): Promise<UserToolPage[]> {
    return this.importUserPages(email, [page]);
  }

  async importUserPages(
    email: string,
    incoming: UserToolPage[],
  ): Promise<UserToolPage[]> {
    const existing = await this.listUserPages(email);
    const byKey = new Map<string, UserToolPage>(
      existing.map((page) => [`${page.kind}:${page.hash}`, page]),
    );
    for (const page of incoming) {
      const key = `${page.kind}:${page.hash}`;
      byKey.set(key, this.mergeUserPage(byKey.get(key), page));
    }
    const trimmed = [...byKey.values()]
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, MAX_USER_PAGES);
    await this.storage.putPrivateJson(this.userPagesKey(email), {
      updatedAt: new Date().toISOString(),
      pages: trimmed,
    });
    return trimmed;
  }

  toUserPage(manifest: ToolPageManifest): UserToolPage {
    return {
      kind: manifest.kind,
      hash: manifest.hash,
      title: manifest.title,
      pageUrl: manifest.pageUrl,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
    };
  }

  private mergeUserPage(
    prev: UserToolPage | undefined,
    page: UserToolPage,
  ): UserToolPage {
    if (!prev) return page;
    const incomingIsNewer =
      String(page.updatedAt) >= String(prev.updatedAt);
    const newer = incomingIsNewer ? page : prev;
    const older = incomingIsNewer ? prev : page;
    return {
      kind: page.kind,
      hash: page.hash,
      title: newer.title || older.title,
      pageUrl: newer.pageUrl || older.pageUrl,
      createdAt: this.minIso(prev.createdAt, page.createdAt),
      updatedAt: this.maxIso(prev.updatedAt, page.updatedAt),
    };
  }

  private minIso(left: string, right: string): string {
    return String(left) <= String(right) ? left : right;
  }

  private maxIso(left: string, right: string): string {
    return String(left) >= String(right) ? left : right;
  }

  private prefix(kind: ToolKind): string {
    return kind === 'subs' ? 'subs/videos' : 'gpx/projects';
  }

  private defaultPageUrl(kind: ToolKind, hash: string): string {
    return kind === 'subs' ? `/subs/${hash}` : `/gpx-route-png/${hash}`;
  }

  private userPagesKey(email: string): string {
    const digest = createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
    return `users/${digest}/pages.json`;
  }

  private extensionFromFilename(filename: string): string {
    const match = /\.([a-zA-Z0-9]{1,12})$/.exec(filename.trim());
    if (!match) return '';
    return `.${match[1].toLowerCase()}`;
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  }
}
