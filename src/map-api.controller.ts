import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Prisma } from './generated/prisma-client';
import { AuthService } from './auth/auth.service';
import { EditAccessGuard } from './auth/edit-access.guard';
import { MapSearchThrottleGuard } from './common/rate-limit.guard';
import { PrismaService } from './prisma/prisma.service';
import { InstagramMetaService } from './services/instagram-meta.service';
import { MapSearchService } from './services/map-search.service';
import { ReelsService } from './services/reels.service';
import { StorageService } from './services/storage.service';

type MapPointBody = {
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  instagramUrl?: string;
  tags?: unknown;
};

type MapTrackBody = {
  name?: string;
  description?: string;
  instagramUrl?: string;
  points?: unknown;
  tags?: unknown;
};

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;

const MAX_TRACK_POINTS = 5000;
const INSTAGRAM_META_TTL_MS = 24 * 60 * 60 * 1000;

const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 50;

@Controller('map-api')
export class MapApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly instagramMetaService: InstagramMetaService,
    private readonly storageService: StorageService,
    private readonly reelsService: ReelsService,
    private readonly mapSearchService: MapSearchService,
    private readonly authService: AuthService,
  ) {}

  @Get('points')
  async listPoints() {
    return this.prisma.mapPoint.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // Public semantic search over map features that have an attached Instagram
  // reel. Reuses the reel embeddings and returns the matching points/tracks
  // ranked by similarity. A geographic constraint in the query ("in an hour's
  // drive from Belgrade", "near X") filters results by distance. Russian
  // queries work best today (reel content is indexed as-is), but the embedding
  // model is multilingual. Rate-limited because it fans out to OpenAI/Nominatim.
  @UseGuards(MapSearchThrottleGuard)
  @Get('search')
  async search(
    @Query('q') q: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    const query = typeof q === 'string' ? q.trim() : '';
    if (!query) {
      return { query: '', geo: null, count: 0, results: [] };
    }

    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const take = Number.isNaN(parsedLimit)
      ? SEARCH_DEFAULT_LIMIT
      : Math.min(Math.max(parsedLimit, 1), SEARCH_MAX_LIMIT);

    const { geo, hits } = await this.mapSearchService.search(query, take);
    if (!hits.length) {
      return { query, geo, count: 0, results: [] };
    }

    const pointIds = hits.filter((h) => h.type === 'point').map((h) => h.id);
    const trackIds = hits.filter((h) => h.type === 'track').map((h) => h.id);
    const [points, tracks] = await Promise.all([
      pointIds.length
        ? this.prisma.mapPoint.findMany({ where: { id: { in: pointIds } } })
        : [],
      trackIds.length
        ? this.prisma.mapTrack.findMany({ where: { id: { in: trackIds } } })
        : [],
    ]);
    const pointById = new Map(
      points.map((point) => [point.id, point] as const),
    );
    const trackById = new Map(
      tracks.map((track) => [track.id, track] as const),
    );

    const results = hits.flatMap((hit) => {
      const feature =
        hit.type === 'point' ? pointById.get(hit.id) : trackById.get(hit.id);
      if (!feature) return [];
      return [
        {
          type: hit.type,
          similarity: hit.similarity,
          distanceKm: hit.distanceKm ?? null,
          feature,
        },
      ];
    });

    return { query, geo, count: results.length, results };
  }

  @UseGuards(EditAccessGuard)
  @Post('points')
  async createPoint(@Body() body: MapPointBody) {
    const name = this.parseName(body.name);
    const { latitude, longitude } = this.parseCoordinates(
      body.latitude,
      body.longitude,
    );
    const instagramUrl = this.parseInstagramUrl(body.instagramUrl);
    this.archiveReel(instagramUrl, true);

    return this.prisma.mapPoint.create({
      data: {
        name,
        latitude,
        longitude,
        description: this.parseOptionalText(body.description),
        instagramUrl,
        tags: this.parseTags(body.tags),
      },
    });
  }

  @UseGuards(EditAccessGuard)
  @Patch('points/:id')
  async updatePoint(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: MapPointBody,
  ) {
    await this.assertPointExists(id);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      data.name = this.parseName(body.name);
    }
    if (body.description !== undefined) {
      data.description = this.parseOptionalText(body.description);
    }
    if (body.instagramUrl !== undefined) {
      data.instagramUrl = this.parseInstagramUrl(body.instagramUrl);
      // The link changed — cached metadata belongs to the old reel
      data.instagramMeta = Prisma.DbNull;
      data.instagramMetaUpdatedAt = null;
      this.archiveReel(data.instagramUrl as string | null, true);
    }
    if (body.tags !== undefined) {
      data.tags = this.parseTags(body.tags);
    }
    if (body.latitude !== undefined || body.longitude !== undefined) {
      const { latitude, longitude } = this.parseCoordinates(
        body.latitude,
        body.longitude,
      );
      data.latitude = latitude;
      data.longitude = longitude;
    }

    return this.prisma.mapPoint.update({ where: { id }, data });
  }

  @UseGuards(EditAccessGuard)
  @Delete('points/:id')
  async deletePoint(@Param('id', ParseIntPipe) id: number) {
    await this.assertPointExists(id);

    await this.prisma.mapPoint.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('tracks')
  async listTracks() {
    return this.prisma.mapTrack.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @UseGuards(EditAccessGuard)
  @Post('tracks')
  async createTrack(@Body() body: MapTrackBody) {
    const instagramUrl = this.parseInstagramUrl(body.instagramUrl);
    this.archiveReel(instagramUrl, true);

    return this.prisma.mapTrack.create({
      data: {
        name: this.parseName(body.name),
        description: this.parseOptionalText(body.description),
        instagramUrl,
        points: this.parseTrackPoints(body.points) as Prisma.InputJsonValue,
        tags: this.parseTags(body.tags),
      },
    });
  }

  @UseGuards(EditAccessGuard)
  @Patch('tracks/:id')
  async updateTrack(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: MapTrackBody,
  ) {
    const track = await this.prisma.mapTrack.findUnique({ where: { id } });
    if (!track) {
      throw new NotFoundException('Track not found');
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      data.name = this.parseName(body.name);
    }
    if (body.description !== undefined) {
      data.description = this.parseOptionalText(body.description);
    }
    if (body.instagramUrl !== undefined) {
      data.instagramUrl = this.parseInstagramUrl(body.instagramUrl);
      // The link changed — cached metadata belongs to the old reel
      data.instagramMeta = Prisma.DbNull;
      data.instagramMetaUpdatedAt = null;
      this.archiveReel(data.instagramUrl as string | null, true);
    }
    if (body.tags !== undefined) {
      data.tags = this.parseTags(body.tags);
    }
    if (body.points !== undefined) {
      data.points = this.parseTrackPoints(body.points);
    }

    return this.prisma.mapTrack.update({ where: { id }, data });
  }

  @UseGuards(EditAccessGuard)
  @Delete('tracks/:id')
  async deleteTrack(@Param('id', ParseIntPipe) id: number) {
    const track = await this.prisma.mapTrack.findUnique({ where: { id } });
    if (!track) {
      throw new NotFoundException('Track not found');
    }

    await this.prisma.mapTrack.delete({ where: { id } });
    return { deleted: true };
  }

  private parseTags(tags: unknown): string[] {
    if (tags === undefined || tags === null) return [];
    if (!Array.isArray(tags)) {
      throw new BadRequestException('Tags must be an array of strings');
    }
    const parsed = [
      ...new Set(
        tags.map((tag) => {
          if (typeof tag !== 'string' || !tag.trim()) {
            throw new BadRequestException(
              'Each tag must be a non-empty string',
            );
          }
          if (tag.length > MAX_TAG_LENGTH) {
            throw new BadRequestException(
              `Tags must be at most ${MAX_TAG_LENGTH} characters`,
            );
          }
          return tag.trim().toLowerCase();
        }),
      ),
    ];
    if (parsed.length > MAX_TAGS) {
      throw new BadRequestException(`At most ${MAX_TAGS} tags are allowed`);
    }
    return parsed;
  }

  private parseTrackPoints(points: unknown): [number, number][] {
    if (!Array.isArray(points) || points.length < 2) {
      throw new BadRequestException(
        'Track must contain at least 2 points ([lat, lng] pairs)',
      );
    }
    if (points.length > MAX_TRACK_POINTS) {
      throw new BadRequestException(
        `Track must contain at most ${MAX_TRACK_POINTS} points`,
      );
    }

    return points.map((point) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        typeof point[0] !== 'number' ||
        typeof point[1] !== 'number'
      ) {
        throw new BadRequestException(
          'Each track point must be a [lat, lng] pair of numbers',
        );
      }
      const { latitude, longitude } = this.parseCoordinates(point[0], point[1]);
      return [latitude, longitude] as [number, number];
    });
  }

  // --- Tag dictionary ---

  @Get('tags')
  async listTags() {
    return this.prisma.mapTag.findMany({ orderBy: { name: 'asc' } });
  }

  @UseGuards(EditAccessGuard)
  @Post('tags')
  async createTag(@Body() body: { name?: string; emoji?: string }) {
    const name = this.parseTagName(body.name);
    const existing = await this.prisma.mapTag.findUnique({ where: { name } });
    if (existing) {
      throw new BadRequestException('Tag already exists');
    }
    return this.prisma.mapTag.create({
      data: { name, emoji: this.parseOptionalText(body.emoji) },
    });
  }

  @UseGuards(EditAccessGuard)
  @Patch('tags/:id')
  async updateTag(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; emoji?: string },
  ) {
    const tag = await this.prisma.mapTag.findUnique({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    const data: Record<string, unknown> = {};
    if (body.emoji !== undefined) {
      data.emoji = this.parseOptionalText(body.emoji);
    }
    if (body.name !== undefined) {
      const name = this.parseTagName(body.name);
      if (name !== tag.name) {
        const duplicate = await this.prisma.mapTag.findUnique({
          where: { name },
        });
        if (duplicate) {
          throw new BadRequestException('Tag already exists');
        }
        data.name = name;
        // Rename the tag on every feature that uses it (the dictionary is
        // shared with the reels notebook)
        await this.prisma
          .$executeRaw`UPDATE "MapPoint" SET tags = array_replace(tags, ${tag.name}, ${name}) WHERE ${tag.name} = ANY(tags)`;
        await this.prisma
          .$executeRaw`UPDATE "MapTrack" SET tags = array_replace(tags, ${tag.name}, ${name}) WHERE ${tag.name} = ANY(tags)`;
        await this.prisma
          .$executeRaw`UPDATE "Reel" SET tags = array_replace(tags, ${tag.name}, ${name}) WHERE ${tag.name} = ANY(tags)`;
      }
    }

    return this.prisma.mapTag.update({ where: { id }, data });
  }

  @UseGuards(EditAccessGuard)
  @Delete('tags/:id')
  async deleteTag(@Param('id', ParseIntPipe) id: number) {
    const tag = await this.prisma.mapTag.findUnique({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    await this.prisma
      .$executeRaw`UPDATE "MapPoint" SET tags = array_remove(tags, ${tag.name}) WHERE ${tag.name} = ANY(tags)`;
    await this.prisma
      .$executeRaw`UPDATE "MapTrack" SET tags = array_remove(tags, ${tag.name}) WHERE ${tag.name} = ANY(tags)`;
    await this.prisma
      .$executeRaw`UPDATE "Reel" SET tags = array_remove(tags, ${tag.name}) WHERE ${tag.name} = ANY(tags)`;
    await this.prisma.mapTag.delete({ where: { id } });
    return { deleted: true };
  }

  private parseTagName(name?: string): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('Tag name is required');
    }
    const parsed = name.trim().toLowerCase();
    if (parsed.length > MAX_TAG_LENGTH) {
      throw new BadRequestException(
        `Tag name must be at most ${MAX_TAG_LENGTH} characters`,
      );
    }
    return parsed;
  }

  // Refresh cached Instagram metadata for a feature. Public on purpose: any
  // visitor opening a point triggers it, but the 24h freshness window keeps
  // us from hammering Instagram. Editors can pass ?force=1 (with the API key)
  // to bypass the window.
  @Post('points/:id/instagram-meta')
  async refreshPointInstagramMeta(
    @Param('id', ParseIntPipe) id: number,
    @Query('force') force: string | undefined,
    @Req() request: Request,
  ) {
    return this.refreshInstagramMeta(
      'point',
      id,
      this.parseForce(force, request),
    );
  }

  @Post('tracks/:id/instagram-meta')
  async refreshTrackInstagramMeta(
    @Param('id', ParseIntPipe) id: number,
    @Query('force') force: string | undefined,
    @Req() request: Request,
  ) {
    return this.refreshInstagramMeta(
      'track',
      id,
      this.parseForce(force, request),
    );
  }

  private parseForce(force: string | undefined, request: Request) {
    if (!force) return false;
    if (!this.canEdit(request)) {
      throw new UnauthorizedException('Sign in or provide a valid API key');
    }
    return true;
  }

  // Editor check for endpoints that are public without editor privileges:
  // Google session or the machine API key.
  private canEdit(request: Request): boolean {
    if (this.authService.getSessionFromRequest(request)) return true;
    const received = request.headers['x-map-api-key'];
    const expected =
      this.configService.get<string>('MAP_API_KEY') ||
      this.configService.get<string>('NOTE_API_KEY');
    return Boolean(
      typeof received === 'string' &&
        received &&
        expected &&
        this.isSameSecret(received, expected),
    );
  }

  private async refreshInstagramMeta(
    kind: 'point' | 'track',
    id: number,
    force = false,
  ) {
    type MetaRecord = {
      instagramUrl: string | null;
      instagramMeta: unknown;
      instagramMetaUpdatedAt: Date | null;
    };
    type MetaDelegate = {
      findUnique(args: { where: { id: number } }): Promise<MetaRecord | null>;
      update(args: {
        where: { id: number };
        data: Record<string, unknown>;
      }): Promise<MetaRecord>;
    };
    const delegate = (kind === 'point'
      ? this.prisma.mapPoint
      : this.prisma.mapTrack) as unknown as MetaDelegate;

    const record = await delegate.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Not found');
    }
    if (!record.instagramUrl) {
      return { instagramMeta: null, refreshed: false };
    }

    // Lazy backfill: features saved before reel archiving existed get their
    // video/meta copied to Spaces the first time someone opens them. No error
    // retries here — the endpoint is public.
    this.archiveReel(record.instagramUrl, false);

    const age = record.instagramMetaUpdatedAt
      ? Date.now() - record.instagramMetaUpdatedAt.getTime()
      : Infinity;
    if (!force && record.instagramMeta && age < INSTAGRAM_META_TTL_MS) {
      return { instagramMeta: record.instagramMeta, refreshed: false };
    }

    const meta = await this.instagramMetaService.fetchMeta(record.instagramUrl);
    if (!meta) {
      // Remember the attempt so failures don't retry on every open
      await delegate.update({
        where: { id },
        data: { instagramMetaUpdatedAt: new Date() },
      });
      return { instagramMeta: record.instagramMeta, refreshed: false };
    }

    const oldMeta = record.instagramMeta as {
      coverUrl?: string;
      thumbnailUrl?: string;
    } | null;
    const coverUrl = await this.persistCover(
      kind,
      id,
      meta.thumbnailUrl,
      oldMeta,
    );
    if (coverUrl) meta.coverUrl = coverUrl;

    const updated = await delegate.update({
      where: { id },
      data: {
        instagramMeta: meta as Prisma.InputJsonValue,
        instagramMetaUpdatedAt: new Date(),
      },
    });
    return { instagramMeta: updated.instagramMeta, refreshed: true };
  }

  // Instagram thumbnail URLs are signed and expire, so copy the cover into
  // our own Spaces bucket under a stable per-feature key.
  private async persistCover(
    kind: 'point' | 'track',
    id: number,
    thumbnailUrl: string | undefined,
    oldMeta: { coverUrl?: string; thumbnailUrl?: string } | null,
  ): Promise<string | undefined> {
    if (!thumbnailUrl) return oldMeta?.coverUrl;

    // Same media file (CDN path ignores the signature) — keep the stored copy
    if (oldMeta?.coverUrl && oldMeta.thumbnailUrl) {
      try {
        if (
          new URL(oldMeta.thumbnailUrl).pathname ===
          new URL(thumbnailUrl).pathname
        ) {
          return oldMeta.coverUrl;
        }
      } catch {
        // fall through to re-download
      }
    }

    try {
      const response = await fetch(thumbnailUrl);
      if (!response.ok) return oldMeta?.coverUrl;
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      return await this.storageService.uploadFileWithKey(
        buffer,
        contentType,
        `places/covers/${kind}-${id}.jpg`,
      );
    } catch {
      return oldMeta?.coverUrl;
    }
  }

  // Map reels join the shared reel notebook pipeline: yt-dlp meta plus a
  // video/cover copy in DO Spaces. The map keeps rendering the Instagram
  // embed player; the archive is for meta, search and longevity.
  private archiveReel(instagramUrl: string | null, retryErrors: boolean): void {
    if (!instagramUrl) return;
    this.reelsService.ensureInBackground(instagramUrl, 'map', retryErrors);
  }

  @UseGuards(EditAccessGuard)
  @Post('key-check')
  checkKey() {
    return { ok: true };
  }

  // Short share links (maps.app.goo.gl) carry no coordinates; follow the
  // redirect server-side so the frontend can parse the expanded URL.
  @Get('resolve-google-link')
  async resolveGoogleLink(@Query('url') url: string | undefined) {
    if (typeof url !== 'string' || !url.trim()) {
      throw new BadRequestException('url query parameter is required');
    }

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new BadRequestException('url must be a valid URL');
    }

    const allowedHost =
      parsed.hostname === 'maps.app.goo.gl' ||
      parsed.hostname === 'goo.gl' ||
      /(^|\.)google\.[a-z.]{2,6}$/.test(parsed.hostname);
    if (parsed.protocol !== 'https:' || !allowedHost) {
      throw new BadRequestException('Only Google Maps links are supported');
    }

    const controller = new AbortController();
    try {
      const response = await fetch(parsed.toString(), {
        redirect: 'follow',
        signal: controller.signal,
      });
      const finalUrl = response.url;
      controller.abort();
      return { url: finalUrl };
    } catch {
      throw new BadRequestException('Could not resolve the link');
    }
  }

  private async assertPointExists(id: number): Promise<void> {
    const point = await this.prisma.mapPoint.findUnique({ where: { id } });
    if (!point) {
      throw new NotFoundException('Point not found');
    }
  }

  private parseName(name?: string): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('Name is required');
    }
    return name.trim();
  }

  private parseOptionalText(text?: string): string | null {
    if (typeof text !== 'string' || !text.trim()) {
      return null;
    }
    return text.trim();
  }

  private parseInstagramUrl(url?: string): string | null {
    if (typeof url !== 'string' || !url.trim()) {
      return null;
    }

    const trimmed = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException('Instagram URL must be a valid URL');
    }

    if (!/(^|\.)instagram\.com$/.test(parsed.hostname)) {
      throw new BadRequestException(
        'Instagram URL must point to instagram.com',
      );
    }

    return trimmed;
  }

  private parseCoordinates(
    latitude?: number,
    longitude?: number,
  ): { latitude: number; longitude: number } {
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      throw new BadRequestException(
        'Latitude and longitude are required numbers',
      );
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Coordinates are out of range');
    }

    return { latitude, longitude };
  }

  private isSameSecret(receivedKey: string, expectedKey: string): boolean {
    const received = Buffer.from(receivedKey);
    const expected = Buffer.from(expectedKey);

    if (received.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(received, expected);
  }
}
