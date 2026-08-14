import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID, timingSafeEqual } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { Prisma } from './generated/prisma-client';
import { PrismaService } from './prisma/prisma.service';
import { DebugLogService } from './services/debug-log.service';
import { LlmService } from './services/llm.service';
import { StorageService } from './services/storage.service';
import { getDiaryChatIdNumber } from './diary.constants';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

type UploadedImage = {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
};

type CreateNoteBody = {
  text?: string;
  date?: string;
};

const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

@Controller('notes-api')
export class NotesApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly llmService: LlmService,
    private readonly telegramBotService: TelegramBotService,
    private readonly debugLogService: DebugLogService,
  ) {}

  @Post('notes')
  @UseInterceptors(
    FileInterceptor('image', {
      dest: tmpdir(),
      limits: {
        fileSize: MAX_IMAGE_SIZE_BYTES,
      },
      fileFilter: (_req, file, callback) => {
        if (file.mimetype.startsWith('image/')) {
          callback(null, true);
          return;
        }

        callback(
          new BadRequestException('Only image files are supported'),
          false,
        );
      },
    }),
  )
  async createNote(
    @Headers('x-note-api-key') apiKey: string | undefined,
    @Body() body: CreateNoteBody,
    @UploadedFile() image?: UploadedImage,
  ) {
    const requestId = randomUUID();

    this.debugLogService.info('notes-api.createNote', 'Request received', {
      requestId,
      hasImage: Boolean(image),
      imageBytes: image?.size,
      imageMimeType: image?.mimetype,
      textLength: typeof body.text === 'string' ? body.text.length : undefined,
      hasDate: typeof body.date === 'string',
    });

    try {
      this.assertApiKey(apiKey);
      this.debugLogService.info('notes-api.createNote', 'API key accepted', {
        requestId,
      });

      if (!image) {
        throw new BadRequestException('Image is required');
      }

      const text = this.parseText(body.text);
      const noteDate = this.parseDate(body.date);
      this.debugLogService.info('notes-api.createNote', 'Request parsed', {
        requestId,
        chatId: getDiaryChatIdNumber(),
        noteDate: noteDate.toISOString(),
        textLength: text.length,
      });

      this.debugLogService.info('notes-api.createNote', 'Reading image file', {
        requestId,
        path: image.path,
      });
      const imageBuffer = await readFile(image.path);
      this.debugLogService.info('notes-api.createNote', 'Uploading image', {
        requestId,
        imageBytes: imageBuffer.length,
        mimeType: image.mimetype,
      });
      const imageUrl = await this.storageService.uploadFile(
        imageBuffer,
        image.mimetype,
        getDiaryChatIdNumber(),
      );
      this.debugLogService.info('notes-api.createNote', 'Image uploaded', {
        requestId,
        imageUrl,
      });

      this.debugLogService.info('notes-api.createNote', 'Describing image', {
        requestId,
      });
      const imageDescription = await this.llmService.describeImage(
        imageBuffer,
        text,
      );
      this.debugLogService.info('notes-api.createNote', 'Image described', {
        requestId,
        descriptionLength: imageDescription.length,
        descriptionPreview: imageDescription.slice(0, 160),
      });

      this.debugLogService.info('notes-api.createNote', 'Creating note', {
        requestId,
        chatId: getDiaryChatIdNumber(),
      });
      const note = await this.prisma.note.create({
        data: {
          content: text,
          noteDate,
          chatId: getDiaryChatIdNumber(),
          rawMessage: {
            source: 'notes-api',
            text,
            date: body.date,
            imageDescription,
            image: {
              originalName: image.originalname,
              mimeType: image.mimetype,
              size: image.size,
            },
          } satisfies Prisma.InputJsonValue,
          images: {
            create: {
              url: imageUrl,
              description: imageDescription,
            },
          },
        },
        include: {
          images: true,
        },
      });
      this.debugLogService.info('notes-api.createNote', 'Note created', {
        requestId,
        noteId: note.id,
        imageCount: note.images.length,
      });

      let telegramSent = false;
      try {
        this.debugLogService.info(
          'notes-api.createNote',
          'Sending Telegram notification',
          {
            requestId,
            chatId: getDiaryChatIdNumber(),
          },
        );
        await this.telegramBotService.sendApiNotePhoto(
          getDiaryChatIdNumber(),
          imageBuffer,
          image.mimetype,
          image.originalname,
          text,
          imageDescription,
          noteDate,
        );
        telegramSent = true;
        this.debugLogService.info(
          'notes-api.createNote',
          'Telegram notification sent',
          {
            requestId,
          },
        );
      } catch (error) {
        this.debugLogService.error(
          'notes-api.createNote',
          'Telegram notification failed after note creation',
          {
            requestId,
            ...this.serializeError(error),
          },
        );
      }

      return {
        id: note.id,
        chatId: getDiaryChatIdNumber(),
        text: note.content,
        date: note.noteDate.toISOString(),
        imageUrl: note.images[0]?.url,
        imageDescription,
        telegramSent,
      };
    } catch (error) {
      this.debugLogService.error('notes-api.createNote', 'Request failed', {
        requestId,
        ...this.serializeError(error),
      });
      throw error;
    } finally {
      if (image) {
        await unlink(image.path).catch((error) => {
          this.debugLogService.warn(
            'notes-api.createNote',
            'Failed to delete temporary image file',
            {
              requestId,
              path: image.path,
              ...this.serializeError(error),
            },
          );
        });
      }
    }
  }

  private assertApiKey(receivedKey?: string): void {
    const expectedKey = this.configService.get<string>('NOTE_API_KEY');
    if (!expectedKey) {
      throw new InternalServerErrorException('NOTE_API_KEY is not configured');
    }

    if (!receivedKey || !this.isSameSecret(receivedKey, expectedKey)) {
      throw new UnauthorizedException('Invalid API key');
    }
  }

  private isSameSecret(receivedKey: string, expectedKey: string): boolean {
    const received = Buffer.from(receivedKey);
    const expected = Buffer.from(expectedKey);

    if (received.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(received, expected);
  }

  private parseText(text?: string): string {
    if (typeof text !== 'string') {
      throw new BadRequestException('Text is required');
    }

    return text.trim();
  }

  private parseDate(date?: string): Date {
    if (typeof date !== 'string') {
      throw new BadRequestException('Date is required');
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Date must be a valid date string');
    }

    return parsedDate;
  }

  private serializeError(error: unknown): Record<string, unknown> {
    if (!(error instanceof Error)) {
      return { error };
    }

    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    };
  }
}
