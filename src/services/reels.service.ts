import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getDiaryChatId } from '../diary.constants';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { EmbeddingsService } from './embeddings.service';

// The subset of `yt-dlp --dump-single-json` output we care about
type YtDlpInfo = {
  title?: string;
  description?: string;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  timestamp?: number;
  upload_date?: string; // YYYYMMDD
  duration?: number;
  thumbnail?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  width?: number;
  height?: number;
  webpage_url?: string;
};

const YTDLP_TIMEOUT_MS = 3 * 60 * 1000;
// 1 fps cap: 2 minutes of frames ≈ 130k input tokens — safely within limits
const MAX_VISION_FRAMES = 120;

@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  extractShortcode(instagramUrl: string): string | null {
    const match =
      /instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(
        instagramUrl,
      );
    return match ? match[1] : null;
  }

  // My own Instagram handle(s), for auto-flagging reels I authored as `isOwn`.
  // Configurable via REELS_OWN_USERNAMES (comma-separated), defaults to the one
  // account this notebook belongs to.
  private ownUsernames(): string[] {
    const raw =
      this.configService.get<string>('REELS_OWN_USERNAMES') || 'vlandivir';
    return raw
      .split(',')
      .map((name) => name.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
  }

  isOwnAuthor(author: string | null | undefined): boolean {
    if (!author) return false;
    const normalized = author.trim().replace(/^@/, '').toLowerCase();
    return this.ownUsernames().includes(normalized);
  }

  // Fire-and-forget entry point for reels referenced outside the notebook
  // (e.g. map features): make sure a shared Reel record exists and kick off
  // meta/video processing without delaying the caller's request.
  ensureInBackground(
    instagramUrl: string,
    source: string,
    retryErrors = false,
  ): void {
    const shortcode = this.extractShortcode(instagramUrl);
    if (!shortcode) return;

    void (async () => {
      const existing = await this.prisma.reel.findUnique({
        where: { shortcode },
      });
      if (!existing) {
        const reel = await this.prisma.reel.create({
          data: { instagramUrl, shortcode, source },
        });
        this.processInBackground(reel.id);
      } else if (existing.status === 'error' && retryErrors) {
        await this.prisma.reel.update({
          where: { id: existing.id },
          data: { status: 'pending', error: null },
        });
        this.processInBackground(existing.id);
      } else if (existing.isOwn && existing.status === 'ready') {
        // Map may attach an already-processed own reel — still mirror it
        // into the diary if it isn't there yet.
        await this.ensureOwnReelInDiary(existing.id);
      }
    })().catch((error) => {
      this.logger.warn(
        `Failed to ensure reel for ${instagramUrl}: ${String(error)}`,
      );
    });
  }

  // Fire-and-forget: the HTTP request returns immediately with a pending
  // record while yt-dlp works in the background; the frontend polls.
  // `onComplete` (when provided) runs once processing has settled — either
  // fully ready (video + transcript + vision + title/tags) or failed — so
  // callers like the Telegram bot can notify the user with the final result.
  processInBackground(
    reelId: number,
    onComplete?: (reelId: number) => void,
  ): void {
    void (async () => {
      try {
        await this.process(reelId);
      } catch (error) {
        // The managed Postgres occasionally drops connections for a few
        // seconds (failover) — retry once before surfacing the error
        if (!this.isTransientDbError(error)) throw error;
        this.logger.warn(`Reel ${reelId}: transient DB error, retrying in 15s`);
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        await this.process(reelId);
      }
    })()
      .catch(async (error) => {
        this.logger.error(`Reel ${reelId} processing failed: ${String(error)}`);
        await this.prisma.reel
          .update({
            where: { id: reelId },
            data: { status: 'error', error: this.userMessage(error) },
          })
          .catch(() => undefined);
      })
      .finally(() => {
        if (!onComplete) return;
        try {
          onComplete(reelId);
        } catch (error) {
          this.logger.warn(
            `Reel ${reelId} completion callback failed: ${String(error)}`,
          );
        }
      });
  }

  private isTransientDbError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("Can't reach database server") ||
      message.includes('Connection terminated') ||
      message.includes('connection slots')
    );
  }

  private async process(reelId: number): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) return;

    const canonicalUrl = `https://www.instagram.com/reel/${reel.shortcode}/`;

    const info = await this.fetchInfo(canonicalUrl);

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'reel-'));
    try {
      const videoPath = await this.downloadVideo(canonicalUrl, tempDir);
      const videoUrl = await this.storageService.uploadStreamWithKey(
        createReadStream(videoPath),
        'video/mp4',
        `reels/videos/${reel.shortcode}.mp4`,
      );

      // Instagram sometimes refuses the thumbnail download — fall back to a
      // frame from the video itself
      const coverUrl =
        (await this.persistCover(reel.shortcode, info.thumbnail)) ||
        (await this.persistCoverFromVideo(reel.shortcode, videoPath, tempDir));

      // For Instagram yt-dlp puts the username in `channel` and the
      // display name in `uploader`
      const author = info.channel || info.uploader || null;
      await this.prisma.reel.update({
        where: { id: reelId },
        data: {
          status: 'ready',
          error: null,
          title: info.title || null,
          description: info.description || null,
          author,
          publishedAt: this.parsePublishedAt(info),
          duration: typeof info.duration === 'number' ? info.duration : null,
          videoUrl,
          coverUrl,
          meta: this.trimInfo(info) as Prisma.InputJsonValue,
          // Reels I authored are "mine" no matter how the link arrived (Telegram,
          // map, manual). Only ever set the flag on — never clear a flag set by
          // the import or by hand for a reel whose author yt-dlp couldn't read.
          ...(this.isOwnAuthor(author) ? { isOwn: true } : {}),
        },
      });

      // The video is ready for the UI; transcription/vision failures must not
      // mark the reel itself as broken. Vision runs after transcription so it
      // can use the transcript as context.
      await this.transcribe(reelId, videoPath, tempDir).catch(async (error) => {
        this.logger.warn(
          `Reel ${reelId} transcription failed: ${String(error)}`,
        );
        await this.prisma.reel
          .update({
            where: { id: reelId },
            data: {
              transcriptStatus: 'error',
              transcriptError: this.userMessage(error),
            },
          })
          .catch(() => undefined);
      });

      await this.analyzeFrames(reelId, videoPath, tempDir).catch(
        async (error) => {
          this.logger.warn(`Reel ${reelId} vision failed: ${String(error)}`);
          await this.prisma.reel
            .update({
              where: { id: reelId },
              data: {
                visionStatus: 'error',
                visionError: this.userMessage(error),
              },
            })
            .catch(() => undefined);
        },
      );

      // With transcript and vision in place, replace yt-dlp's generic
      // "Video by <author>" with a meaningful title. Awaited so callers of
      // processInBackground see the finished title/tags in their onComplete.
      await this.enrich(reelId);

      // Own Instagram reels also land in the personal diary (same chat as
      // /diary), dated by Instagram publish time.
      const finished = await this.prisma.reel.findUnique({
        where: { id: reelId },
        select: { isOwn: true },
      });
      if (finished?.isOwn) {
        await this.ensureOwnReelInDiary(reelId).catch((error) => {
          this.logger.warn(
            `Reel ${reelId} diary mirror failed: ${String(error)}`,
          );
        });
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Idempotently mirror an own Instagram reel into the diary as a Note+Video
   * dated with `publishedAt`. Skips when already linked (meta.diaryNoteId),
   * when the same video URL is already in the diary, or when a diary-v*
   * proxy was marked as a duplicate of this shortcode.
   */
  async ensureOwnReelInDiary(
    reelId: number,
  ): Promise<{ noteId: number; created: boolean } | null> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel?.isOwn || reel.status !== 'ready' || !reel.videoUrl) {
      return null;
    }

    const meta = this.asMetaObject(reel.meta);
    if (typeof meta.diaryNoteId === 'number') {
      return { noteId: meta.diaryNoteId, created: false };
    }

    const existingByUrl = await this.prisma.video.findFirst({
      where: { url: reel.videoUrl, note: { chatId: getDiaryChatId() } },
      select: { noteId: true },
    });
    if (existingByUrl?.noteId) {
      await this.rememberDiaryNote(reel.id, meta, existingByUrl.noteId);
      return { noteId: existingByUrl.noteId, created: false };
    }

    const existingByShortcode = await this.prisma.note.findFirst({
      where: {
        chatId: getDiaryChatId(),
        OR: [
          { content: { contains: reel.shortcode } },
          { content: { contains: reel.instagramUrl } },
        ],
      },
      select: { id: true },
    });
    if (existingByShortcode) {
      await this.rememberDiaryNote(reel.id, meta, existingByShortcode.id);
      return { noteId: existingByShortcode.id, created: false };
    }

    // diary-v* proxies created from Telegram copies may already cover this
    // Instagram reel (manual duplicateOf or same caption stored earlier).
    const diaryProxy = await this.prisma.reel.findFirst({
      where: {
        shortcode: { startsWith: 'diary-v' },
        meta: { path: ['duplicateOf'], equals: reel.shortcode },
      },
      select: { meta: true },
    });
    const proxyVideoId =
      diaryProxy &&
      typeof this.asMetaObject(diaryProxy.meta).diaryVideoId === 'number'
        ? (this.asMetaObject(diaryProxy.meta).diaryVideoId as number)
        : null;
    if (proxyVideoId) {
      const proxyVideo = await this.prisma.video.findUnique({
        where: { id: proxyVideoId },
        select: { noteId: true },
      });
      if (proxyVideo?.noteId) {
        await this.rememberDiaryNote(reel.id, meta, proxyVideo.noteId);
        return { noteId: proxyVideo.noteId, created: false };
      }
    }

    const caption = reel.description?.trim() || reel.title?.trim() || null;
    const content = [caption, reel.instagramUrl].filter(Boolean).join('\n\n');

    const note = await this.prisma.note.create({
      data: {
        content,
        chatId: getDiaryChatId(),
        noteDate: reel.publishedAt || reel.createdAt,
        rawMessage: {
          source: 'own-reel',
          reelId: reel.id,
          shortcode: reel.shortcode,
          instagramUrl: reel.instagramUrl,
        } as Prisma.InputJsonValue,
        videos: {
          create: {
            url: reel.videoUrl,
            description: caption,
          },
        },
      },
    });

    await this.rememberDiaryNote(reel.id, meta, note.id);
    this.logger.log(
      `Own reel ${reel.shortcode} mirrored to diary note ${note.id}`,
    );
    return { noteId: note.id, created: true };
  }

  private asMetaObject(meta: unknown): Record<string, unknown> {
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      return { ...(meta as Record<string, unknown>) };
    }
    return {};
  }

  private async rememberDiaryNote(
    reelId: number,
    meta: Record<string, unknown>,
    noteId: number,
  ): Promise<void> {
    await this.prisma.reel.update({
      where: { id: reelId },
      data: {
        meta: { ...meta, diaryNoteId: noteId } as Prisma.InputJsonValue,
      },
    });
  }

  // Force (re-)transcription of an already downloaded reel: fetches the video
  // copy from Spaces, extracts the audio and runs Whisper.
  transcribeInBackground(reelId: number): void {
    void this.transcribeFromSpaces(reelId).catch(async (error) => {
      this.logger.warn(`Reel ${reelId} transcription failed: ${String(error)}`);
      await this.prisma.reel
        .update({
          where: { id: reelId },
          data: {
            transcriptStatus: 'error',
            transcriptError: this.userMessage(error),
          },
        })
        .catch(() => undefined);
    });
  }

  // Re-run transcription for every downloaded reel, one at a time so we don't
  // hammer Spaces/OpenAI. Returns the number of queued reels immediately.
  async transcribeAllInBackground(): Promise<number> {
    const reels = await this.prisma.reel.findMany({
      where: { status: 'ready', videoUrl: { not: null } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    await this.prisma.reel.updateMany({
      where: { id: { in: reels.map((reel) => reel.id) } },
      data: { transcriptStatus: 'pending', transcriptError: null },
    });

    void (async () => {
      for (const { id } of reels) {
        try {
          await this.transcribeFromSpaces(id);
        } catch (error) {
          this.logger.warn(
            `Reel ${id} bulk transcription failed: ${String(error)}`,
          );
          await this.prisma.reel
            .update({
              where: { id },
              data: {
                transcriptStatus: 'error',
                transcriptError: this.userMessage(error),
              },
            })
            .catch(() => undefined);
        }
      }
      this.logger.log(`Bulk transcription finished (${reels.length} reels)`);
    })();

    return reels.length;
  }

  // Download + process still-pending reels one at a time, sleeping `delayMs`
  // between each. Deliberately slow: the yt-dlp downloads hit Instagram from the
  // droplet's datacenter IP, which gets rate-limited (and the account blocked)
  // if we burst. Fire-and-forget; returns how many reels were queued. Safe to
  // re-run — reels that already went to ready/error are skipped, and each reel
  // is re-checked as still pending right before it is processed.
  async processPendingInBackground(
    delayMs = 180_000,
    limit?: number,
  ): Promise<number> {
    const reels = await this.prisma.reel.findMany({
      where: { status: 'pending' },
      select: { id: true },
      orderBy: { id: 'asc' },
      ...(limit ? { take: limit } : {}),
    });

    this.logger.log(
      `Bulk processing started (${reels.length} reels, delay ${delayMs}ms)`,
    );
    void (async () => {
      let done = 0;
      let failed = 0;
      for (let i = 0; i < reels.length; i++) {
        const { id } = reels[i];
        // Nothing in the per-reel work is allowed to escape: a transient DB
        // blip on the status re-check, a process() throw, anything — must skip
        // this one reel, never kill the whole (multi-hour) run.
        try {
          // It may have been processed by another trigger while we waited
          const current = await this.prisma.reel.findUnique({
            where: { id },
            select: { status: true },
          });
          if (current?.status !== 'pending') continue;

          await this.process(id);
          done++;
          this.logger.log(
            `Bulk processing ${i + 1}/${reels.length}: reel ${id} ready`,
          );
        } catch (error) {
          failed++;
          this.logger.error(
            `Reel ${id} bulk processing failed: ${String(error)}`,
          );
          await this.prisma.reel
            .update({
              where: { id },
              data: { status: 'error', error: this.userMessage(error) },
            })
            .catch(() => undefined);
        }

        if (i < reels.length - 1 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      this.logger.log(
        `Bulk processing finished (${reels.length} reels: ${done} ready, ${failed} failed)`,
      );
    })().catch((error) => {
      // Last-resort guard so a bug in the loop scaffolding can never surface as
      // an unhandled rejection that silently stops everything.
      this.logger.error(`Bulk processing loop crashed: ${String(error)}`);
    });

    return reels.length;
  }

  private async transcribeFromSpaces(reelId: number): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel?.videoUrl) return;

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'reel-audio-'));
    try {
      const videoPath = path.join(tempDir, 'video.mp4');
      const buffer = await this.storageService.downloadFile(reel.videoUrl);
      await writeFile(videoPath, buffer);
      await this.transcribe(reelId, videoPath, tempDir);
      this.enrichInBackground(reelId);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  // Generate a short human title from everything we know about the reel
  // (caption, transcript, vision description) instead of yt-dlp's generic
  // "Video by <author>". Best-effort: failures keep the old title.
  async generateTitle(reelId: number): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) return;

    const sources = [
      reel.visionDescription
        ? `Что происходит в ролике:\n${reel.visionDescription.slice(0, 1500)}`
        : null,
      reel.transcriptClean || reel.transcript
        ? `Расшифровка речи:\n${(reel.transcriptClean || reel.transcript || '').slice(0, 1500)}`
        : null,
      reel.description
        ? `Описание под видео:\n${reel.description.slice(0, 800)}`
        : null,
    ].filter(Boolean);
    if (!sources.length) return;

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) return;
    const model =
      this.configService.get<string>('REELS_LLM_MODEL') || 'gpt-5-mini';

    const prompt = [
      'Придумай короткое название для записи о коротком видео (Instagram reel) в личной записной книжке.',
      'Требования: русский язык, 3–8 слов, по сути содержания, без кавычек, эмодзи и точки в конце, без слов «видео» и «ролик».',
      'В ответе верни только само название.',
      ...sources,
    ].join('\n\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 500,
        reasoning_effort: 'minimal',
      }),
      signal: AbortSignal.timeout(60 * 1000),
    });
    if (!response.ok) {
      throw new Error(`Title LLM error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const title = data.choices?.[0]?.message?.content
      ?.trim()
      .replace(/^["«»']+|["«»'.]+$/g, '')
      .slice(0, 200);
    if (!title) return;

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { title },
    });
  }

  private enrichInBackground(reelId: number): void {
    void this.enrich(reelId);
  }

  // Title first (it's a source for the embedding), then the search embedding.
  // Individual failures are swallowed so one flaky step doesn't block the rest.
  private async enrich(reelId: number): Promise<void> {
    await this.generateTitle(reelId).catch((error) => {
      this.logger.warn(
        `Reel ${reelId} title generation failed: ${String(error)}`,
      );
    });
    await this.indexReel(reelId).catch((error) => {
      this.logger.warn(`Reel ${reelId} embedding failed: ${String(error)}`);
    });
  }

  // Concatenate everything we know about the reel and store its embedding
  async indexReel(reelId: number): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) return;

    const content = [
      reel.title,
      reel.description,
      reel.tags?.length ? `Теги: ${reel.tags.join(', ')}` : null,
      reel.transcriptClean || reel.transcript,
      reel.visionDescription,
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!content.trim()) return;

    await this.embeddingsService.upsert('reel', reel.id, content);
  }

  // Semantic search over indexed reels: [{id, similarity}], best first
  async searchReels(
    query: string,
    limit = 12,
  ): Promise<{ id: number; similarity: number }[]> {
    const results = await this.embeddingsService.search('reel', query, {
      limit,
    });
    return results.map((r) => ({ id: r.refId, similarity: r.similarity }));
  }

  async unindexReel(reelId: number): Promise<void> {
    await this.embeddingsService.remove('reel', reelId);
  }

  // Recompute embeddings for all ready reels; returns how many were queued
  async embedAllInBackground(): Promise<number> {
    const reels = await this.prisma.reel.findMany({
      where: { status: 'ready' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    void (async () => {
      for (const { id } of reels) {
        try {
          await this.indexReel(id);
        } catch (error) {
          this.logger.warn(
            `Reel ${id} bulk embedding failed: ${String(error)}`,
          );
        }
      }
      this.logger.log(`Bulk embedding finished for ${reels.length} reels`);
    })();

    return reels.length;
  }

  /**
   * Run Whisper + frame vision + title/embedding for a reel that already has
   * `videoUrl` (no Instagram/yt-dlp download). Used for diary videos imported
   * into the Reel table so they share the same RAG index as Instagram reels.
   */
  async analyzeExistingVideo(reelId: number): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel?.videoUrl) {
      throw new Error(`Reel ${reelId} has no videoUrl`);
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'reel-analyze-'));
    try {
      const videoPath = path.join(tempDir, 'video.mp4');
      const buffer = await this.storageService.downloadFile(reel.videoUrl);
      await writeFile(videoPath, buffer);

      if (!reel.coverUrl) {
        const coverUrl = await this.persistCoverFromVideo(
          reel.shortcode,
          videoPath,
          tempDir,
        );
        if (coverUrl) {
          await this.prisma.reel.update({
            where: { id: reelId },
            data: { coverUrl },
          });
        }
      }

      await this.transcribe(reelId, videoPath, tempDir).catch(async (error) => {
        this.logger.warn(
          `Reel ${reelId} transcription failed: ${String(error)}`,
        );
        await this.prisma.reel
          .update({
            where: { id: reelId },
            data: {
              transcriptStatus: 'error',
              transcriptError: this.userMessage(error),
            },
          })
          .catch(() => undefined);
      });

      await this.analyzeFrames(reelId, videoPath, tempDir).catch(
        async (error) => {
          this.logger.warn(`Reel ${reelId} vision failed: ${String(error)}`);
          await this.prisma.reel
            .update({
              where: { id: reelId },
              data: {
                visionStatus: 'error',
                visionError: this.userMessage(error),
              },
            })
            .catch(() => undefined);
        },
      );

      await this.enrich(reelId);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  // Force (re-)extraction of frames + LLM description for a downloaded reel
  visionInBackground(reelId: number): void {
    void (async () => {
      const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
      if (!reel?.videoUrl) return;

      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'reel-vision-'));
      try {
        const videoPath = path.join(tempDir, 'video.mp4');
        const buffer = await this.storageService.downloadFile(reel.videoUrl);
        await writeFile(videoPath, buffer);
        await this.analyzeFrames(reelId, videoPath, tempDir);
        this.enrichInBackground(reelId);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    })().catch(async (error) => {
      this.logger.warn(`Reel ${reelId} vision failed: ${String(error)}`);
      await this.prisma.reel
        .update({
          where: { id: reelId },
          data: {
            visionStatus: 'error',
            visionError: this.userMessage(error),
          },
        })
        .catch(() => undefined);
    });
  }

  // Extract 1 frame per second, store the frames in Spaces and ask the LLM
  // to describe what happens in the video (using the transcript as context).
  private async analyzeFrames(
    reelId: number,
    videoPath: string,
    tempDir: string,
  ): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) return;

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { visionStatus: 'pending', visionError: null },
    });

    const framesDir = path.join(tempDir, 'frames');
    await mkdir(framesDir, { recursive: true });
    // 768px wide is what the vision model gets after its own downscale anyway
    await this.runFfmpeg([
      '-y',
      '-i',
      videoPath,
      '-vf',
      'fps=1,scale=768:-2',
      '-q:v',
      '4',
      '-frames:v',
      String(MAX_VISION_FRAMES),
      path.join(framesDir, '%03d.jpg'),
    ]);

    const frameFiles = (await readdir(framesDir))
      .filter((file) => file.endsWith('.jpg'))
      .sort();
    if (!frameFiles.length) {
      throw new Error('ffmpeg produced no frames');
    }

    const frameUrls: string[] = [];
    const buffers: Buffer[] = [];
    for (const file of frameFiles) {
      const buffer = await readFile(path.join(framesDir, file));
      buffers.push(buffer);
      frameUrls.push(
        await this.storageService.uploadFileWithKey(
          buffer,
          'image/jpeg',
          `reels/frames/${reel.shortcode}/${file}`,
        ),
      );
    }

    const visionDescription = await this.describeFrames(buffers, reel);

    await this.prisma.reel.update({
      where: { id: reelId },
      data: {
        frameUrls,
        visionDescription,
        visionStatus: 'ready',
        visionError: null,
      },
    });
  }

  private async describeFrames(
    frames: Buffer[],
    reel: {
      description: string | null;
      transcriptClean: string | null;
      transcript: string | null;
    },
  ): Promise<string | null> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const model =
      this.configService.get<string>('REELS_LLM_MODEL') || 'gpt-5-mini';
    const transcript = reel.transcriptClean || reel.transcript;

    const prompt = [
      'Ниже кадры из короткого видео (Instagram reel), взятые по одному в секунду, в хронологическом порядке.',
      'Опиши на русском языке, что происходит в ролике: последовательность действий и сцен, место съёмки, важные объекты и детали.',
      'Если на кадрах есть экранные надписи или текстовые плашки — обязательно перепиши их текст дословно (в оригинальном языке).',
      'Пиши связным текстом без вводных слов, не упоминай слова «кадр» и «видео». Не пересказывай расшифровку речи — она дана только как контекст.',
      reel.description
        ? `Контекст — описание под видео:\n${reel.description.slice(0, 800)}`
        : null,
      transcript
        ? `Контекст — расшифровка речи:\n${transcript.slice(0, 2000)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const content: unknown[] = [{ type: 'text', text: prompt }];
    for (const frame of frames) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${frame.toString('base64')}`,
        },
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        max_completion_tokens: 4000,
        reasoning_effort: 'minimal',
      }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Vision LLM error: ${response.status} ${response.statusText}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`,
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  }

  private async transcribe(
    reelId: number,
    videoPath: string,
    tempDir: string,
  ): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) return;

    await this.prisma.reel.update({
      where: { id: reelId },
      data: { transcriptStatus: 'pending', transcriptError: null },
    });

    const audioPath = path.join(tempDir, 'audio.mp3');
    await this.runFfmpeg([
      '-y',
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-ac',
      '1',
      '-b:a',
      '64k',
      audioPath,
    ]);

    const audioBuffer = await readFile(audioPath);
    const audioUrl = await this.storageService.uploadFileWithKey(
      audioBuffer,
      'audio/mpeg',
      `reels/audio/${reel.shortcode}.mp3`,
    );

    const result = await this.requestWhisper(audioBuffer, reel.shortcode);

    // Keep the raw verbose response (segments etc.) for future LLM steps
    await this.storageService
      .uploadFileWithKey(
        Buffer.from(JSON.stringify(result)),
        'application/json',
        `reels/transcripts/${reel.shortcode}.json`,
      )
      .catch(() => undefined);

    const transcript = (result.text || '').trim();

    // Best-effort LLM pass: fix recognition errors and split into replicas.
    // The raw Whisper text stays authoritative if this fails.
    let transcriptClean: string | null = null;
    if (transcript) {
      transcriptClean = await this.refineTranscript(
        transcript,
        reel.description,
      ).catch((error) => {
        this.logger.warn(
          `Transcript refine failed for reel ${reelId}: ${String(error)}`,
        );
        return null;
      });
    }

    await this.prisma.reel.update({
      where: { id: reelId },
      data: {
        audioUrl,
        transcript,
        transcriptClean,
        transcriptLang: result.language || null,
        transcriptStatus: 'ready',
        transcriptError: null,
      },
    });
  }

  // Ask a small LLM to correct Whisper mistakes (using the reel description
  // as context) and split the text into replicas, one per line.
  private async refineTranscript(
    transcript: string,
    description: string | null,
  ): Promise<string | null> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) return null;

    const model =
      this.configService.get<string>('REELS_LLM_MODEL') || 'gpt-5-mini';

    const prompt = [
      'Ниже автоматическая расшифровка аудиодорожки короткого видео (Instagram reel).',
      'Исправь ошибки распознавания речи, расставь пунктуацию и разбей текст на реплики — законченные фразы, каждая на отдельной строке.',
      'Язык текста сохрани, ничего не переводи, не пересказывай и не добавляй от себя. Если фрагмент бессмысленный — оставь как есть.',
      'В ответе верни только исправленный текст, без пояснений.',
      description
        ? `Контекст (описание под видео, поможет с именами и терминами):\n${description.slice(0, 1000)}`
        : null,
      `Расшифровка:\n${transcript}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 4000,
        reasoning_effort: 'minimal',
      }),
      signal: AbortSignal.timeout(2 * 60 * 1000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `LLM error: ${response.status} ${response.statusText}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`,
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  }

  private async requestWhisper(
    audioBuffer: Buffer,
    shortcode: string,
  ): Promise<{ text?: string; language?: string }> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' }),
      `${shortcode}.mp3`,
    );
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0');

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(10 * 60 * 1000),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Whisper error: ${response.status} ${response.statusText}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`,
      );
    }

    return (await response.json()) as { text?: string; language?: string };
  }

  private async persistCoverFromVideo(
    shortcode: string,
    videoPath: string,
    tempDir: string,
  ): Promise<string | null> {
    try {
      const framePath = path.join(tempDir, 'cover.jpg');
      await this.runFfmpeg([
        '-y',
        '-ss',
        '0.5',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        framePath,
      ]);
      const buffer = await readFile(framePath);
      return await this.storageService.uploadFileWithKey(
        buffer,
        'image/jpeg',
        `reels/covers/${shortcode}.jpg`,
      );
    } catch (error) {
      this.logger.warn(
        `Cover frame extraction failed for ${shortcode}: ${String(error)}`,
      );
      return null;
    }
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args, { timeout: YTDLP_TIMEOUT_MS });
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

  private async fetchInfo(url: string): Promise<YtDlpInfo> {
    const stdout = await this.runYtDlp([
      '--dump-single-json',
      '--no-download',
      '--no-warnings',
      '--no-playlist',
      url,
    ]);
    return JSON.parse(stdout) as YtDlpInfo;
  }

  private async downloadVideo(url: string, tempDir: string): Promise<string> {
    // Instagram's muxed mp4 URLs often fail with 429/500; DASH video+audio
    // (merged by ffmpeg) is reliable, so prefer it with muxed as fallback
    await this.runYtDlp([
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
      '--no-playlist',
      '--no-warnings',
      '-o',
      path.join(tempDir, 'video.%(ext)s'),
      url,
    ]);

    const files = await readdir(tempDir);
    const video = files.find((file) => file.startsWith('video.'));
    if (!video) {
      throw new Error('yt-dlp finished but produced no video file');
    }
    return path.join(tempDir, video);
  }

  // Instagram thumbnail URLs are signed and expire — keep our own copy
  private async persistCover(
    shortcode: string,
    thumbnailUrl: string | undefined,
  ): Promise<string | null> {
    if (!thumbnailUrl) return null;
    try {
      const response = await fetch(thumbnailUrl);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      return await this.storageService.uploadFileWithKey(
        buffer,
        contentType,
        `reels/covers/${shortcode}.jpg`,
      );
    } catch {
      return null;
    }
  }

  private async runYtDlp(args: string[]): Promise<string> {
    // Anonymous first: public reels don't need the account session, and every
    // authenticated request risks getting the account flagged. Cookies are the
    // fallback for login-walled posts.
    const cookiesFile = this.configService.get<string>('YTDLP_COOKIES_FILE');
    try {
      return await this.execYtDlp(args);
    } catch (error) {
      if (!cookiesFile) throw error;
      this.logger.warn(
        `anonymous yt-dlp failed (${error instanceof Error ? error.message : error}), retrying with cookies`,
      );
      return this.execYtDlp(['--cookies', cookiesFile, ...args]);
    }
  }

  private execYtDlp(fullArgs: string[]): Promise<string> {
    const binary = this.configService.get<string>('YTDLP_PATH') || 'yt-dlp';

    return new Promise<string>((resolve, reject) => {
      const child = spawn(binary, fullArgs, {
        timeout: YTDLP_TIMEOUT_MS,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error('yt-dlp is not installed on the server'));
        } else {
          reject(error);
        }
      });
      child.on('close', (code, signal) => {
        if (code === 0) {
          resolve(stdout);
        } else if (signal) {
          reject(new Error(`yt-dlp timed out (${signal})`));
        } else {
          const lastLine =
            stderr
              .trim()
              .split('\n')
              .filter(Boolean)
              .pop()
              ?.replace(/^ERROR:\s*/, '') || `yt-dlp exited with code ${code}`;
          reject(new Error(lastLine));
        }
      });
    });
  }

  private parsePublishedAt(info: YtDlpInfo): Date | null {
    if (typeof info.timestamp === 'number') {
      return new Date(info.timestamp * 1000);
    }
    if (info.upload_date && /^\d{8}$/.test(info.upload_date)) {
      const iso = `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`;
      const date = new Date(`${iso}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
  }

  // The full dump-json is hundreds of KB (formats list etc.) — keep the
  // fields that matter for the notebook
  private trimInfo(info: YtDlpInfo): Record<string, unknown> {
    return {
      title: info.title,
      description: info.description,
      uploader: info.uploader,
      uploaderId: info.uploader_id,
      channel: info.channel,
      timestamp: info.timestamp,
      duration: info.duration,
      viewCount: info.view_count,
      likeCount: info.like_count,
      commentCount: info.comment_count,
      width: info.width,
      height: info.height,
      webpageUrl: info.webpage_url,
    };
  }

  private userMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
  }
}
