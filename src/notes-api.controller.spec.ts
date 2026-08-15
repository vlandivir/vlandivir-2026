import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { getDiaryChatIdNumber } from './diary.constants';
import { NotesApiController } from './notes-api.controller';
import { PrismaService } from './prisma/prisma.service';
import { DebugLogService } from './services/debug-log.service';
import { LlmService } from './services/llm.service';
import { StorageService } from './services/storage.service';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

describe('NotesApiController', () => {
  let controller: NotesApiController;
  let prisma: {
    note: {
      create: jest.Mock;
    };
  };
  let storageService: {
    uploadFile: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let llmService: {
    describeImage: jest.Mock;
  };
  let telegramBotService: {
    sendApiNotePhoto: jest.Mock;
    sendApiNoteText: jest.Mock;
  };
  let debugLogService: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'notes-api-test-'));

    prisma = {
      note: {
        create: jest.fn().mockResolvedValue({
          id: 10,
          content: 'hello note',
          noteDate: new Date('2026-05-21T10:00:00.000Z'),
          images: [{ url: 'https://example.com/image.jpg' }],
        }),
      },
    };
    storageService = {
      uploadFile: jest.fn().mockResolvedValue('https://example.com/image.jpg'),
    };
    configService = {
      get: jest.fn().mockReturnValue('secret'),
    };
    llmService = {
      describeImage: jest.fn().mockResolvedValue('AI image description'),
    };
    telegramBotService = {
      sendApiNotePhoto: jest.fn(),
      sendApiNoteText: jest.fn(),
    };
    debugLogService = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    controller = new NotesApiController(
      prisma as unknown as PrismaService,
      storageService as unknown as StorageService,
      configService as unknown as ConfigService,
      llmService as unknown as LlmService,
      telegramBotService as unknown as TelegramBotService,
      debugLogService as unknown as DebugLogService,
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a note for the primary chat with an uploaded image', async () => {
    const imagePath = join(tmpDir, 'image.jpg');
    await writeFile(imagePath, Buffer.from('image'));

    const result = await controller.createNote(
      'secret',
      { text: ' hello note ', date: '2026-05-21T10:00:00.000Z' },
      {
        path: imagePath,
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
        size: 5,
      },
    );

    expect(storageService.uploadFile).toHaveBeenCalledWith(
      Buffer.from('image'),
      'image/jpeg',
      getDiaryChatIdNumber(),
    );
    expect(llmService.describeImage).toHaveBeenCalledWith(
      Buffer.from('image'),
      'hello note',
    );
    expect(prisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'hello note',
          chatId: getDiaryChatIdNumber(),
          images: {
            create: {
              url: 'https://example.com/image.jpg',
              description: 'AI image description',
            },
          },
        }),
      }),
    );
    expect(telegramBotService.sendApiNotePhoto).toHaveBeenCalledWith(
      getDiaryChatIdNumber(),
      Buffer.from('image'),
      'image/jpeg',
      'image.jpg',
      'hello note',
      'AI image description',
      new Date('2026-05-21T10:00:00.000Z'),
    );
    expect(result).toEqual({
      id: 10,
      chatId: getDiaryChatIdNumber(),
      text: 'hello note',
      date: '2026-05-21T10:00:00.000Z',
      imageUrl: 'https://example.com/image.jpg',
      imageDescription: 'AI image description',
      telegramSent: true,
    });
    expect(debugLogService.info).toHaveBeenCalledWith(
      'notes-api.createNote',
      'Note created',
      expect.objectContaining({ noteId: 10 }),
    );
  });

  it('creates a text-only note when no image is uploaded', async () => {
    prisma.note.create.mockResolvedValue({
      id: 11,
      content: 'hello note',
      noteDate: new Date('2026-05-21T10:00:00.000Z'),
    });

    const result = await controller.createNote('secret', {
      text: ' hello note ',
      date: '2026-05-21T10:00:00.000Z',
    });

    expect(storageService.uploadFile).not.toHaveBeenCalled();
    expect(llmService.describeImage).not.toHaveBeenCalled();
    expect(prisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'hello note',
          chatId: getDiaryChatIdNumber(),
        }),
      }),
    );
    expect(telegramBotService.sendApiNoteText).toHaveBeenCalledWith(
      getDiaryChatIdNumber(),
      'hello note',
      new Date('2026-05-21T10:00:00.000Z'),
    );
    expect(result).toEqual({
      id: 11,
      chatId: getDiaryChatIdNumber(),
      text: 'hello note',
      date: '2026-05-21T10:00:00.000Z',
      telegramSent: true,
    });
  });

  it('rejects text-only notes without text', async () => {
    await expect(
      controller.createNote('secret', {
        text: '   ',
        date: '2026-05-21T10:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects requests with a wrong API key', async () => {
    await expect(
      controller.createNote('wrong', {
        text: 'hello',
        date: '2026-05-21T10:00:00.000Z',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('keeps the saved note response when Telegram notification fails', async () => {
    const imagePath = join(tmpDir, 'telegram-fail.jpg');
    await writeFile(imagePath, Buffer.from('image'));
    telegramBotService.sendApiNotePhoto.mockRejectedValue(
      new Error('Telegram failed'),
    );

    const result = await controller.createNote(
      'secret',
      { text: 'hello note', date: '2026-05-21T10:00:00.000Z' },
      {
        path: imagePath,
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
        size: 5,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 10,
        telegramSent: false,
      }),
    );
    expect(debugLogService.error).toHaveBeenCalledWith(
      'notes-api.createNote',
      'Telegram notification failed after note creation',
      expect.objectContaining({
        errorMessage: 'Telegram failed',
      }),
    );
  });
});
