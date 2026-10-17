import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { DateParserService } from '../services/date-parser.service';
import { DebugLogService } from '../services/debug-log.service';
import { LlmService } from '../services/llm.service';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as sharp from 'sharp';

const MAX_TELEGRAM_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;
const TARGET_TELEGRAM_PHOTO_BYTES = 9 * 1024 * 1024;
const MAX_TELEGRAM_PHOTO_DIMENSION_SUM = 10000;

/** Telegram media caption limit. */
export const CAPTION_MAX = 1024;
/** Telegram plain message limit. */
export const MESSAGE_MAX = 4096;
/** Above this length, prefer an AI summary for media captions. */
export const SUMMARY_TRIGGER = 800;
/** Chunk size for long reply text (under MESSAGE_MAX with headroom). */
export const CHUNK_MAX = 4000;

@Injectable()
export class DairyCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dateParser: DateParserService,
    private readonly debugLogService: DebugLogService,
    private readonly llmService: LlmService,
  ) {}

  async handleDairyCommand(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const messageText = this.getCommandText(ctx);
    if (!messageText) return;

    const dateArg = messageText.split(' ').slice(1).join(' ').trim();

    try {
      const { date: parsedDate } = this.dateParser.extractDateFromFirstLine(
        dateArg || '',
      );

      if (!dateArg) {
        const today = new Date();
        const previousYearsNotes = await this.getDairyNotesForDayMonth(
          chatId,
          today.getMonth(),
          today.getDate(),
        );
        await this.sendDairyNotesAllYears(
          ctx,
          previousYearsNotes,
          format(today, 'd MMMM', { locale: ru }),
        );
      } else {
        if (!parsedDate) {
          await ctx.reply(
            'Не удалось распознать дату. Используйте форматы: DD.MM.YYYY, DD.MM, DD месяц',
          );
          return;
        }

        if (dateArg.includes(String(parsedDate.getFullYear()))) {
          const notes = await this.getDairyNotes(chatId, parsedDate);
          await this.sendDairyNotes(
            ctx,
            notes,
            format(parsedDate, 'd MMMM yyyy', { locale: ru }),
          );
        } else {
          const notes = await this.getDairyNotesForDayMonth(
            chatId,
            parsedDate.getMonth(),
            parsedDate.getDate(),
          );
          await this.sendDairyNotesAllYears(
            ctx,
            notes,
            format(parsedDate, 'd MMMM', { locale: ru }),
          );
        }
      }
    } catch (error) {
      console.error('Error handling dairy command:', error);
      await ctx.reply('Произошла ошибка при получении заметок');
    }
  }

  private getCommandText(ctx: Context): string | undefined {
    if ('message' in ctx && ctx.message && 'text' in ctx.message) {
      return ctx.message.text;
    }
    if ('channelPost' in ctx && ctx.channelPost && 'text' in ctx.channelPost) {
      return ctx.channelPost.text;
    }
    return undefined;
  }

  private async getDairyNotes(chatId: number, date: Date) {
    return await this.prisma.note.findMany({
      where: {
        chatId,
        deletedAt: null,
        noteDate: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
      },
      include: {
        images: true,
        videos: true,
      },
      orderBy: {
        noteDate: 'asc',
      },
    });
  }

  private async getDairyNotesForDayMonth(
    chatId: number,
    month: number,
    day: number,
  ) {
    const currentYear = new Date().getFullYear();
    const startYear = 1978;
    const years = Array.from(
      { length: currentYear - startYear + 1 },
      (_, i) => currentYear - i,
    );

    const notesPromises = years.map((year) =>
      this.prisma.note.findMany({
        where: {
          chatId,
          deletedAt: null,
          noteDate: {
            gte: startOfDay(new Date(year, month, day)),
            lt: endOfDay(new Date(year, month, day)),
          },
        },
        include: {
          images: true,
          videos: true,
        },
        orderBy: {
          noteDate: 'asc',
        },
      }),
    );

    const allNotes = await Promise.all(notesPromises);

    return allNotes.reduce<Record<number, (typeof allNotes)[0]>>(
      (acc, notes, index) => {
        const year = currentYear - index;
        if (notes.length > 0) {
          acc[year] = notes;
        }
        return acc;
      },
      {},
    );
  }

  private async sendDairyNotes(
    ctx: Context,
    notes: {
      content: string | null;
      images: { url: string }[];
      videos: { url: string }[];
    }[],
    dateStr: string,
  ) {
    if (notes.length === 0) {
      await ctx.reply(`Заметок за ${dateStr} не найдено`);
      return;
    }

    for (const note of notes) {
      await this.sendOneDairyNote(ctx, note);
    }
  }

  private async sendDairyNotesAllYears(
    ctx: Context,
    notesByYear: Record<
      number,
      {
        content: string | null;
        images: { url: string }[];
        videos: { url: string }[];
      }[]
    >,
    dateStr: string,
  ) {
    const years = Object.keys(notesByYear).sort(
      (a, b) => Number(b) - Number(a),
    );

    if (years.length === 0) {
      await ctx.reply(`Заметок за ${dateStr} не найдено`);
      return;
    }

    for (const year of years) {
      const notes = notesByYear[year] as {
        content: string | null;
        images: { url: string }[];
        videos: { url: string }[];
      }[];
      await ctx.reply(`${dateStr} ${year}:`);

      for (const note of notes) {
        await this.sendOneDairyNote(ctx, note);
      }
    }
  }

  private async sendOneDairyNote(
    ctx: Context,
    note: {
      content: string | null;
      images: { url: string }[];
      videos: { url: string }[];
    },
  ): Promise<void> {
    let hasMedia = false;
    if (note.images && note.images.length > 0) {
      hasMedia = true;
      for (const image of note.images) {
        await this.sendDairyImage(ctx, image.url, note.content || undefined);
      }
    }
    if (note.videos && note.videos.length > 0) {
      hasMedia = true;
      this.debugLogService.info('dairy-send', 'Sending videos from /d', {
        chatId: ctx.chat?.id,
        videosCount: note.videos.length,
      });
      const { caption } = await this.captionForVideo(
        note.content || undefined,
      );
      for (const video of note.videos) {
        try {
          await ctx.replyWithVideo(video.url, {
            caption,
          });
        } catch (e) {
          this.debugLogService.warn(
            'dairy-send',
            'replyWithVideo failed, falling back to URL',
            {
              chatId: ctx.chat?.id,
              videoUrl: video.url,
              error: e instanceof Error ? e.message : 'unknown',
            },
          );
          console.warn(
            'Failed to send video via Telegram, falling back to URL',
            e,
          );
          const fallback = caption
            ? `⚠️ ${caption}\n\n(Ссылка на видео: ${video.url})`
            : video.url;
          await this.replyTextChunks(ctx, fallback);
        }
      }
    }
    if (!hasMedia) {
      const text = note.content || '';
      if (text.length > MESSAGE_MAX) {
        await this.replyTextChunks(ctx, text);
      } else {
        await ctx.reply(text);
      }
    }
  }

  /**
   * Build a Telegram media caption. Long notes get an AI summary; full text
   * is sent separately when `sendFullText` is true.
   */
  async captionForMedia(
    content?: string,
  ): Promise<{ caption?: string; sendFullText: boolean }> {
    if (!content) {
      return { caption: undefined, sendFullText: false };
    }

    if (content.length <= SUMMARY_TRIGGER) {
      return {
        caption: this.toTelegramCaption(content),
        sendFullText: false,
      };
    }

    const summary =
      await this.llmService.summarizeForTelegramCaption(content);
    if (summary && summary.length > 0 && summary.length <= CAPTION_MAX) {
      return { caption: summary, sendFullText: true };
    }

    return {
      caption: this.toTelegramCaption(content),
      sendFullText: true,
    };
  }

  /**
   * Video captions always use an AI summary (no full transcript, no length
   * trigger). `sendFullText` is always false.
   */
  async captionForVideo(
    content?: string,
  ): Promise<{ caption?: string; sendFullText: boolean }> {
    if (!content) {
      return { caption: undefined, sendFullText: false };
    }

    const summary =
      await this.llmService.summarizeForTelegramCaption(content);
    if (summary && summary.length > 0 && summary.length <= CAPTION_MAX) {
      return { caption: summary, sendFullText: false };
    }

    return {
      caption: this.toTelegramCaption(content),
      sendFullText: false,
    };
  }

  async replyTextChunks(ctx: Context, text: string): Promise<void> {
    if (!text) return;
    for (const chunk of splitTelegramTextChunks(text, CHUNK_MAX)) {
      await ctx.reply(chunk);
    }
  }

  private async sendDairyImage(
    ctx: Context,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    try {
      this.debugLogService.info('dairy-send', 'Downloading image for send', {
        chatId: ctx.chat?.id,
        imageUrl,
      });

      const originalBuffer = await this.downloadImage(imageUrl);
      const preparedBuffer =
        await this.prepareDairyImageForTelegram(originalBuffer);
      const { caption: safeCaption, sendFullText } =
        await this.captionForMedia(caption);

      if (preparedBuffer.length > MAX_TELEGRAM_PHOTO_UPLOAD_BYTES) {
        await ctx.replyWithDocument(
          {
            source: preparedBuffer,
            filename: this.getImageFileName(imageUrl),
          },
          {
            caption: safeCaption,
          },
        );
      } else {
        await ctx.replyWithPhoto(
          {
            source: preparedBuffer,
            filename: this.getImageFileName(imageUrl),
          },
          {
            caption: safeCaption,
          },
        );
      }

      if (sendFullText && caption) {
        await this.replyTextChunks(ctx, caption);
      }
    } catch (error) {
      this.debugLogService.warn(
        'dairy-send',
        'Sending image buffer failed, falling back to URL',
        {
          chatId: ctx.chat?.id,
          imageUrl,
          error: error instanceof Error ? error.message : 'unknown',
        },
      );
      const fallback = caption
        ? `⚠️ ${caption}\n\n(Ссылка на картинку: ${imageUrl})`
        : `⚠️ Ссылка на картинку: ${imageUrl}`;
      await this.replyTextChunks(ctx, fallback);
    }
  }

  private async downloadImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Image download failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async prepareDairyImageForTelegram(
    imageBuffer: Buffer,
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const needsResize =
      width + height > MAX_TELEGRAM_PHOTO_DIMENSION_SUM ||
      imageBuffer.length > TARGET_TELEGRAM_PHOTO_BYTES;

    if (!needsResize) {
      this.debugLogService.info('dairy-send', 'Using original image buffer', {
        imageBytes: imageBuffer.length,
        width,
        height,
      });
      return imageBuffer;
    }

    const maxDimensionCandidates = [4096, 3600, 3200, 2560, 2048];
    const qualityCandidates = [92, 88, 84, 80, 76, 72, 68];
    let smallestCandidate: Buffer | undefined;
    let smallestMeta: Record<string, unknown> | undefined;

    for (const maxDimension of maxDimensionCandidates) {
      for (const quality of qualityCandidates) {
        const candidate = await sharp(imageBuffer)
          .rotate()
          .resize({
            width: maxDimension,
            height: maxDimension,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .flatten({ background: '#ffffff' })
          .jpeg({
            quality,
            mozjpeg: true,
            chromaSubsampling: '4:4:4',
          })
          .toBuffer();

        const meta = {
          originalBytes: imageBuffer.length,
          outputBytes: candidate.length,
          originalWidth: width,
          originalHeight: height,
          maxDimension,
          quality,
        };

        if (!smallestCandidate || candidate.length < smallestCandidate.length) {
          smallestCandidate = candidate;
          smallestMeta = meta;
        }

        if (candidate.length <= TARGET_TELEGRAM_PHOTO_BYTES) {
          this.debugLogService.info(
            'dairy-send',
            'Compressed image for Telegram',
            meta,
          );
          return candidate;
        }
      }
    }

    this.debugLogService.warn(
      'dairy-send',
      'Compressed image is still above Telegram photo target',
      smallestMeta,
    );

    return smallestCandidate || imageBuffer;
  }

  private toTelegramCaption(caption?: string): string | undefined {
    if (!caption) return undefined;
    if (caption.length <= CAPTION_MAX) return caption;
    return `${caption.slice(0, CAPTION_MAX - 3)}...`;
  }

  private getImageFileName(imageUrl: string): string {
    try {
      const pathname = new URL(imageUrl).pathname;
      const fileName = pathname.split('/').pop();
      return fileName && fileName.includes('.') ? fileName : 'diary-image.jpg';
    } catch {
      return 'diary-image.jpg';
    }
  }
}

/** Split long text into Telegram-safe chunks, preferring paragraph breaks. */
export function splitTelegramTextChunks(
  text: string,
  maxLen: number = CHUNK_MAX,
): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt < maxLen * 0.4) {
      splitAt = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitAt < maxLen * 0.4) {
      splitAt = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitAt < maxLen * 0.4) {
      splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}
