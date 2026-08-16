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
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { endOfDay, startOfDay } from 'date-fns';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { AdminSessionGuard } from './auth/admin-session.guard';
import { getDiaryChatId, getDiaryChatIdNumber } from './diary.constants';
import { PrismaService } from './prisma/prisma.service';
import { LlmService, DESCRIBE_FAILURE_SENTINELS } from './services/llm.service';
import { StorageService } from './services/storage.service';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

const FIRST_DIARY_YEAR = 1978;
// Web upload bypasses Telegram getFile's ~20 MB cap; 100 MB is enough for
// diary clips while staying within typical Spaces/memory limits.
const MAX_DIARY_VIDEO_BYTES = 100 * 1024 * 1024;

type UpdateNoteBody = {
  content?: string;
};

type UpdateImageBody = {
  description?: string;
};

type UploadedVideo = {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
};

// Owner-only diary API (page: /diary). Session only, like the email
// dashboard — there is no machine-key use case here.
@UseGuards(AdminSessionGuard)
@Controller('diary-api')
export class DiaryApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly storageService: StorageService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  // Which day-of-month cells have at least one note (any year), for the
  // year-agnostic calendar. Month/day are 1-indexed. Soft-deleted notes
  // are excluded so empty days don't stay highlighted.
  @Get('calendar')
  async calendar() {
    const rows = await this.prisma.$queryRaw<
      { month: number; day: number; count: number }[]
    >`
      SELECT
        EXTRACT(MONTH FROM "noteDate")::int AS month,
        EXTRACT(DAY FROM "noteDate")::int AS day,
        COUNT(*)::int AS count
      FROM "Note"
      WHERE "chatId" = ${getDiaryChatId()}
        AND "deletedAt" IS NULL
      GROUP BY month, day
      ORDER BY month, day
    `;
    return { days: rows };
  }

  // Soft-deleted notes, newest archive action first.
  @Get('archive')
  async archive() {
    const notes = await this.prisma.note.findMany({
      where: {
        chatId: getDiaryChatId(),
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        content: true,
        noteDate: true,
        deletedAt: true,
        images: { select: { id: true, url: true, description: true } },
        videos: { select: { id: true, url: true, description: true } },
      },
    });
    return { notes };
  }

  // All notes for one day-of-month across every year, newest year first.
  @Get('day')
  async day(
    @Query('month') monthArg: string | undefined,
    @Query('day') dayArg: string | undefined,
  ) {
    const month = Number(monthArg);
    const day = Number(dayArg);
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31
    ) {
      throw new BadRequestException('month (1-12) and day (1-31) are required');
    }

    const currentYear = new Date().getFullYear();
    const years = Array.from(
      { length: currentYear - FIRST_DIARY_YEAR + 1 },
      (_, i) => currentYear - i,
    );

    const notesByYear = await Promise.all(
      years.map((year) => {
        const target = new Date(year, month - 1, day);
        return this.prisma.note.findMany({
          where: {
            chatId: getDiaryChatId(),
            deletedAt: null,
            noteDate: {
              gte: startOfDay(target),
              lt: endOfDay(target),
            },
          },
          orderBy: { noteDate: 'asc' },
          select: {
            id: true,
            content: true,
            noteDate: true,
            images: { select: { id: true, url: true, description: true } },
            videos: { select: { id: true, url: true, description: true } },
          },
        });
      }),
    );

    const result = years
      .map((year, index) => ({ year, notes: notesByYear[index] }))
      .filter((entry) => entry.notes.length > 0);

    return { month, day, years: result };
  }

  // Edit a note's text (media stays untouched). Scoped to the diary chat so
  // only the owner's notes can be edited.
  @Patch('notes/:id')
  async updateNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateNoteBody,
  ) {
    if (typeof body?.content !== 'string') {
      throw new BadRequestException('content is required');
    }
    const content = body.content;

    const updated = await this.prisma.note.updateMany({
      where: { id, chatId: getDiaryChatId(), deletedAt: null },
      data: { content },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Note not found');
    }

    // Drop the stale search vector; the lazy indexer (DiarySearchService)
    // re-embeds the note on the next search.
    await this.prisma.embedding.deleteMany({
      where: { kind: 'note', refId: id },
    });

    return { id, content };
  }

  // Soft-delete: note leaves the calendar/day views and bot /d, but stays
  // recoverable from GET /archive.
  @Delete('notes/:id')
  async deleteNote(@Param('id', ParseIntPipe) id: number) {
    const updated = await this.prisma.note.updateMany({
      where: { id, chatId: getDiaryChatId(), deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Note not found');
    }

    await this.prisma.embedding.deleteMany({
      where: { kind: 'note', refId: id },
    });

    return { id, deleted: true };
  }

  @Post('notes/:id/restore')
  async restoreNote(@Param('id', ParseIntPipe) id: number) {
    const updated = await this.prisma.note.updateMany({
      where: { id, chatId: getDiaryChatId(), deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Archived note not found');
    }

    return { id, restored: true };
  }

  // Attach a video to an existing note (web upload; bypasses Bot API 20 MB).
  // Optional ?notify=1 also pushes the clip to the owner's Telegram chat.
  @Post('notes/:id/videos')
  @UseInterceptors(
    FileInterceptor('video', {
      dest: tmpdir(),
      limits: { fileSize: MAX_DIARY_VIDEO_BYTES },
      fileFilter: (_req, file, callback) => {
        if (file.mimetype.startsWith('video/')) {
          callback(null, true);
          return;
        }
        callback(
          new BadRequestException('Only video files are supported'),
          false,
        );
      },
    }),
  )
  async uploadNoteVideo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedVideo | undefined,
    @Query('notify') notifyArg?: string,
    @Body() body?: { description?: string },
  ) {
    if (!file) {
      throw new BadRequestException('video file is required');
    }

    const note = await this.prisma.note.findFirst({
      where: { id, chatId: getDiaryChatId(), deletedAt: null },
      select: { id: true, content: true, noteDate: true },
    });
    if (!note) {
      await this.safeUnlink(file.path);
      throw new NotFoundException('Note not found');
    }

    let videoUrl: string;
    try {
      const buffer = await readFile(file.path);
      videoUrl = await this.storageService.uploadVideo(
        buffer,
        file.mimetype || 'video/mp4',
        getDiaryChatIdNumber(),
      );
    } catch (error) {
      await this.safeUnlink(file.path);
      throw error;
    }
    await this.safeUnlink(file.path);

    const description =
      typeof body?.description === 'string' ? body.description : '';

    const video = await this.prisma.video.create({
      data: {
        url: videoUrl,
        description,
        noteId: note.id,
      },
      select: { id: true, url: true, description: true },
    });

    let telegramSent = false;
    const notify =
      notifyArg === '1' || notifyArg === 'true' || notifyArg === 'yes';
    if (notify) {
      try {
        await this.telegramBotService.sendDiaryVideo(
          getDiaryChatIdNumber(),
          video.url,
          note.content || undefined,
          note.noteDate,
        );
        telegramSent = true;
      } catch (error) {
        console.error('Failed to send diary video to Telegram', error);
      }
    }

    return { ...video, telegramSent };
  }

  // Push an already-attached video to the owner's Telegram chat (e.g. after
  // a web upload that skipped notify, or to re-send).
  @Post('videos/:id/send')
  async sendVideoToChat(@Param('id', ParseIntPipe) id: number) {
    const video = await this.prisma.video.findFirst({
      where: {
        id,
        note: { chatId: getDiaryChatId(), deletedAt: null },
      },
      select: {
        id: true,
        url: true,
        note: { select: { content: true, noteDate: true } },
      },
    });
    if (!video?.note) {
      throw new NotFoundException('Video not found');
    }

    await this.telegramBotService.sendDiaryVideo(
      getDiaryChatIdNumber(),
      video.url,
      video.note.content || undefined,
      video.note.noteDate,
    );

    return { id: video.id, sent: true };
  }

  // Edit an image's description (e.g. correct a poor auto-transcription).
  // Scoped to the diary chat via the image's parent note.
  @Patch('images/:id')
  async updateImage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateImageBody,
  ) {
    if (typeof body?.description !== 'string') {
      throw new BadRequestException('description is required');
    }
    const description = body.description;

    const updated = await this.prisma.image.updateMany({
      where: { id, note: { chatId: getDiaryChatId(), deletedAt: null } },
      data: { description },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Image not found');
    }

    await this.prisma.embedding.deleteMany({
      where: { kind: 'image', refId: id },
    });

    return { id, description };
  }

  // Re-run handwriting recognition: several independent vision passes plus a
  // merge/refine text pass, then persist and return the result.
  @Post('images/:id/describe')
  async describeImage(@Param('id', ParseIntPipe) id: number) {
    const image = await this.prisma.image.findFirst({
      where: { id, note: { chatId: getDiaryChatId(), deletedAt: null } },
      select: { id: true, url: true, note: { select: { content: true } } },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    let buffer: Buffer;
    try {
      buffer = await this.storageService.downloadFile(image.url);
    } catch {
      throw new ServiceUnavailableException('Failed to download image');
    }

    const noteContext = image.note?.content?.trim() || undefined;
    const description = await this.llmService.recognizeHandwriting(
      buffer,
      noteContext,
      { reasoningEffort: 'medium' },
    );
    if (
      (DESCRIBE_FAILURE_SENTINELS as readonly string[]).includes(
        description.trim(),
      )
    ) {
      throw new ServiceUnavailableException(description.trim());
    }

    await this.prisma.image.update({
      where: { id },
      data: { description },
    });
    await this.prisma.embedding.deleteMany({
      where: { kind: 'image', refId: id },
    });

    return { id, description };
  }

  // Edit a video's description. Scoped to the diary chat via the parent note.
  // Videos aren't part of the RAG index, so there's no embedding to drop.
  @Patch('videos/:id')
  async updateVideo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateImageBody,
  ) {
    if (typeof body?.description !== 'string') {
      throw new BadRequestException('description is required');
    }
    const description = body.description;

    const updated = await this.prisma.video.updateMany({
      where: { id, note: { chatId: getDiaryChatId(), deletedAt: null } },
      data: { description },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Video not found');
    }

    return { id, description };
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // temp file may already be gone
    }
  }
}
