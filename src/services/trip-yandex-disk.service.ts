import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const YANDEX_API = 'https://cloud-api.yandex.net/v1/disk';
const DEFAULT_ROOT = 'disk:/Фото поездок';

type SyncStatus = {
  configured: boolean;
  folderPath: string | null;
  publicUrl: string | null;
  autoSync: boolean;
  status: string;
  total: number;
  synced: number;
  failed: number;
  startedAt: string | null;
  syncedAt: string | null;
  error: string | null;
};

export function sanitizeYandexPathPart(value: string): string {
  return (
    value
      .normalize('NFKC')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 120) || 'Поездка'
  );
}

export function buildYandexFilename(
  originalFilename: string,
  contentHash: string,
): string {
  const cleaned = sanitizeYandexPathPart(originalFilename).slice(0, 180);
  const dot = cleaned.lastIndexOf('.');
  const hasExtension = dot > 0 && dot >= cleaned.length - 13;
  const base = hasExtension ? cleaned.slice(0, dot) : cleaned;
  const extension = hasExtension ? cleaned.slice(dot) : '';
  return `${base.slice(0, 180)}__${contentHash.slice(0, 8)}${extension}`;
}

@Injectable()
export class TripYandexDiskService {
  private readonly logger = new Logger(TripYandexDiskService.name);
  private readonly running = new Map<string, Promise<void>>();
  private readonly rerun = new Set<string>();
  private readonly fullCheck = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async getStatus(tripId: string): Promise<SyncStatus> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        yandexDiskPath: true,
        yandexDiskPublicUrl: true,
        yandexDiskAutoSync: true,
        yandexDiskSyncStatus: true,
        yandexDiskSyncStartedAt: true,
        yandexDiskSyncedAt: true,
        yandexDiskSyncError: true,
      },
    });
    const [total, synced, failed] = await Promise.all([
      this.prisma.tripMedia.count({ where: { tripId, deletedAt: null } }),
      this.prisma.tripMedia.count({
        where: { tripId, deletedAt: null, yandexDiskSyncedAt: { not: null } },
      }),
      this.prisma.tripMedia.count({
        where: {
          tripId,
          deletedAt: null,
          yandexDiskSyncError: { not: null },
        },
      }),
    ]);
    const isRunning = this.running.has(tripId);
    return {
      configured: this.isConfigured(),
      folderPath: trip.yandexDiskPath,
      publicUrl: trip.yandexDiskPublicUrl,
      autoSync: trip.yandexDiskAutoSync,
      status: isRunning ? 'running' : trip.yandexDiskSyncStatus,
      total,
      synced,
      failed,
      startedAt: trip.yandexDiskSyncStartedAt?.toISOString() || null,
      syncedAt: trip.yandexDiskSyncedAt?.toISOString() || null,
      error: trip.yandexDiskSyncError,
    };
  }

  async createFolderAndSync(tripId: string, title: string) {
    this.requireToken();
    const current = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { yandexDiskPath: true },
    });
    const folderPath =
      current.yandexDiskPath || this.buildFolderPath(title, tripId);
    const created = await this.ensureFolder(folderPath);
    const publicUrl = await this.publishFolder(folderPath);
    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: tripId },
        data: {
          yandexDiskPath: folderPath,
          yandexDiskPublicUrl: publicUrl,
          yandexDiskSyncStatus: 'idle',
          yandexDiskSyncError: null,
        },
      }),
      ...(created
        ? [
            this.prisma.tripMedia.updateMany({
              where: { tripId },
              data: {
                yandexDiskPath: null,
                yandexDiskSyncedAt: null,
                yandexDiskSyncError: null,
              },
            }),
          ]
        : []),
    ]);
    this.schedule(tripId, true);
    return this.getStatus(tripId);
  }

  async runManualSync(tripId: string) {
    this.requireToken();
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { yandexDiskPath: true },
    });
    if (!trip.yandexDiskPath) {
      throw new ServiceUnavailableException(
        'Сначала создайте папку Яндекс Диска',
      );
    }
    this.schedule(tripId, true);
    return this.getStatus(tripId);
  }

  async setAutoSync(tripId: string, enabled: boolean) {
    this.requireToken();
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { yandexDiskPath: true },
    });
    if (enabled && !trip.yandexDiskPath) {
      throw new ServiceUnavailableException(
        'Сначала создайте папку Яндекс Диска',
      );
    }
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { yandexDiskAutoSync: enabled },
    });
    if (enabled) this.schedule(tripId, false);
    return this.getStatus(tripId);
  }

  scheduleNewMedia(tripId: string): void {
    if (!this.isConfigured()) return;
    void this.prisma.trip
      .findUnique({
        where: { id: tripId },
        select: { yandexDiskPath: true, yandexDiskAutoSync: true },
      })
      .then((trip) => {
        if (trip?.yandexDiskPath && trip.yandexDiskAutoSync) {
          this.schedule(tripId, false);
        }
      })
      .catch((error) => {
        this.logger.error(
          `Could not schedule Yandex Disk sync for ${tripId}: ${this.errorMessage(error)}`,
        );
      });
  }

  private schedule(tripId: string, fullCheck: boolean): void {
    if (fullCheck) this.fullCheck.add(tripId);
    if (this.running.has(tripId)) {
      this.rerun.add(tripId);
      return;
    }
    const promise = this.runScheduled(tripId)
      .catch((error) => {
        this.logger.error(
          `Yandex Disk queue failed for trip ${tripId}: ${this.errorMessage(error)}`,
        );
      })
      .finally(() => {
        this.running.delete(tripId);
      });
    this.running.set(tripId, promise);
  }

  private async runScheduled(tripId: string): Promise<void> {
    do {
      this.rerun.delete(tripId);
      const fullCheck = this.fullCheck.delete(tripId);
      await this.syncTrip(tripId, fullCheck);
    } while (this.rerun.has(tripId));
  }

  private async syncTrip(tripId: string, fullCheck: boolean): Promise<void> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { yandexDiskPath: true },
    });
    if (!trip.yandexDiskPath) return;

    const startedAt = new Date();
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        yandexDiskSyncStatus: 'running',
        yandexDiskSyncStartedAt: startedAt,
        yandexDiskSyncError: null,
      },
    });

    let failures = 0;
    try {
      const folderCreated = await this.ensureFolder(trip.yandexDiskPath);
      if (folderCreated) {
        await this.prisma.tripMedia.updateMany({
          where: { tripId },
          data: {
            yandexDiskPath: null,
            yandexDiskSyncedAt: null,
            yandexDiskSyncError: null,
          },
        });
      }

      const media = await this.prisma.tripMedia.findMany({
        where: { tripId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      for (const item of media) {
        if (!fullCheck && item.yandexDiskSyncedAt) continue;
        const filename = buildYandexFilename(
          item.originalFilename,
          item.contentHash,
        );
        const path = `${trip.yandexDiskPath}/${filename}`;
        try {
          if (fullCheck && (await this.resourceExists(path))) {
            await this.markMediaSynced(item.id, path);
            continue;
          }
          await this.uploadMedia(item, path);
          await this.markMediaSynced(item.id, path);
        } catch (error) {
          failures += 1;
          const message = this.errorMessage(error).slice(0, 500);
          await this.prisma.tripMedia.update({
            where: { id: item.id },
            data: { yandexDiskPath: path, yandexDiskSyncError: message },
          });
          this.logger.error(
            `Yandex Disk sync failed for media ${item.id}: ${message}`,
          );
        }
      }

      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          yandexDiskSyncStatus: failures ? 'error' : 'complete',
          yandexDiskSyncedAt: new Date(),
          yandexDiskSyncError: failures
            ? `Не удалось синхронизировать файлов: ${failures}`
            : null,
        },
      });
    } catch (error) {
      const message = this.errorMessage(error).slice(0, 500);
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          yandexDiskSyncStatus: 'error',
          yandexDiskSyncError: message,
        },
      });
      this.logger.error(
        `Yandex Disk sync failed for trip ${tripId}: ${message}`,
      );
    }
  }

  private async markMediaSynced(mediaId: string, path: string): Promise<void> {
    await this.prisma.tripMedia.update({
      where: { id: mediaId },
      data: {
        yandexDiskPath: path,
        yandexDiskSyncedAt: new Date(),
        yandexDiskSyncError: null,
      },
    });
  }

  private async uploadMedia(
    media: {
      tripId: string;
      contentHash: string;
      originalFilename: string;
      mimeType: string;
    },
    path: string,
  ): Promise<void> {
    const upload = await this.apiJson<{ href: string; method?: string }>(
      'GET',
      '/resources/upload',
      { path, overwrite: 'false' },
      [200],
      [409],
    );
    if (!upload) return;

    const sourceUrl = await this.storage.getTripMediaPresignedDownloadUrl(
      media.tripId,
      media.contentHash,
      media.originalFilename,
      3600,
    );
    const source = await fetch(sourceUrl);
    if (!source.ok || !source.body) {
      throw new Error(`Не удалось прочитать оригинал (${source.status})`);
    }
    const body = Readable.fromWeb(source.body as never);
    const response = await fetch(upload.href, {
      method: upload.method || 'PUT',
      headers: { 'Content-Type': media.mimeType },
      body: body as never,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!response.ok) {
      throw new Error(
        `Яндекс Диск отклонил файл (${response.status}): ${(
          await response.text()
        ).slice(0, 240)}`,
      );
    }
  }

  private async resourceExists(path: string): Promise<boolean> {
    const result = await this.apiJson<Record<string, unknown>>(
      'GET',
      '/resources',
      { path, fields: 'path,type,size' },
      [200],
      [404],
    );
    return Boolean(result);
  }

  private async publishFolder(path: string): Promise<string> {
    await this.apiJson<Record<string, unknown>>(
      'PUT',
      '/resources/publish',
      { path },
      [200, 201, 202],
      [409],
    );
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const resource = await this.apiJson<{ public_url?: string }>(
        'GET',
        '/resources',
        { path, fields: 'public_url' },
        [200],
      );
      if (resource?.public_url) return resource.public_url;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Яндекс Диск не вернул публичную ссылку на папку');
  }

  /** Returns true when the final folder was newly created. */
  private async ensureFolder(path: string): Promise<boolean> {
    const withoutPrefix = path.replace(/^disk:\/?/, '').replace(/^\/+/, '');
    const parts = withoutPrefix.split('/').filter(Boolean);
    let current = 'disk:';
    let finalCreated = false;
    for (const [index, part] of parts.entries()) {
      current += `/${part}`;
      const created = await this.apiJson<Record<string, unknown>>(
        'PUT',
        '/resources',
        { path: current },
        [201],
        [409],
      );
      if (index === parts.length - 1) finalCreated = Boolean(created);
    }
    return finalCreated;
  }

  private async apiJson<T>(
    method: string,
    endpoint: string,
    params: Record<string, string>,
    successStatuses: number[],
    emptyStatuses: number[] = [],
  ): Promise<T | null> {
    const url = new URL(`${YANDEX_API}${endpoint}`);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `OAuth ${this.requireToken()}`,
      },
    });
    if (emptyStatuses.includes(response.status)) return null;
    if (!successStatuses.includes(response.status)) {
      throw new Error(
        `Яндекс Диск API (${response.status}): ${(await response.text()).slice(
          0,
          300,
        )}`,
      );
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private buildFolderPath(title: string, tripId: string): string {
    const configuredRoot =
      this.config.get<string>('YANDEX_DISK_TRIP_ROOT') || DEFAULT_ROOT;
    let root = configuredRoot.trim().replace(/\/+$/, '');
    if (root.startsWith('/')) root = `disk:${root}`;
    else if (!root.startsWith('disk:/')) root = `disk:/${root}`;
    return `${root}/${sanitizeYandexPathPart(title)}-${tripId.slice(-6)}`;
  }

  private isConfigured(): boolean {
    return Boolean(this.config.get<string>('YANDEX_DISK_OAUTH_TOKEN')?.trim());
  }

  private requireToken(): string {
    const token = this.config.get<string>('YANDEX_DISK_OAUTH_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'Интеграция с Яндекс Диском ещё не настроена',
      );
    }
    return token;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
