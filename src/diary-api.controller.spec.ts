import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getDiaryChatId, getDiaryChatIdNumber } from './diary.constants';
import { DiaryApiController } from './diary-api.controller';
import { PrismaService } from './prisma/prisma.service';
import { LlmService } from './services/llm.service';
import { StorageService } from './services/storage.service';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

describe('DiaryApiController', () => {
  let controller: DiaryApiController;
  let prisma: {
    $queryRaw: jest.Mock;
    note: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    image: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    video: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    embedding: { deleteMany: jest.Mock };
  };
  let llmService: {
    describeImage: jest.Mock;
    refineHandwrittenText: jest.Mock;
    recognizeHandwriting: jest.Mock;
  };
  let storageService: {
    downloadFile: jest.Mock;
    uploadVideo: jest.Mock;
  };
  let telegramBotService: {
    sendDiaryVideo: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      note: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      image: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      video: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      embedding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    llmService = {
      describeImage: jest.fn(),
      refineHandwrittenText: jest.fn(),
      recognizeHandwriting: jest.fn(),
    };
    storageService = {
      downloadFile: jest.fn(),
      uploadVideo: jest.fn(),
    };
    telegramBotService = {
      sendDiaryVideo: jest.fn().mockResolvedValue(undefined),
    };
    controller = new DiaryApiController(
      prisma as unknown as PrismaService,
      llmService as unknown as LlmService,
      storageService as unknown as StorageService,
      telegramBotService as unknown as TelegramBotService,
    );
  });

  describe('calendar', () => {
    it('returns day-of-month rows scoped to the diary chat', async () => {
      prisma.$queryRaw.mockResolvedValue([{ month: 7, day: 24, count: 3 }]);

      const result = await controller.calendar();

      expect(result).toEqual({ days: [{ month: 7, day: 24, count: 3 }] });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('day', () => {
    it('rejects an out-of-range month or day', async () => {
      await expect(controller.day('13', '1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.day('7', '40')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.note.findMany).not.toHaveBeenCalled();
    });

    it('groups notes by year, newest first, scoped to the chat', async () => {
      const currentYear = new Date().getFullYear();
      prisma.note.findMany.mockImplementation(({ where }) => {
        expect(where.chatId).toBe(getDiaryChatId());
        expect(where.deletedAt).toBeNull();
        const year = where.noteDate.gte.getFullYear();
        if (year === currentYear) {
          return Promise.resolve([
            {
              id: 1,
              content: 'now',
              noteDate: new Date(),
              images: [],
              videos: [],
            },
          ]);
        }
        if (year === currentYear - 1) {
          return Promise.resolve([
            {
              id: 2,
              content: 'last year',
              noteDate: new Date(),
              images: [],
              videos: [],
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await controller.day('7', '24');

      expect(result.month).toBe(7);
      expect(result.day).toBe(24);
      expect(result.years.map((y) => y.year)).toEqual([
        currentYear,
        currentYear - 1,
      ]);
      // chatId must never leak into the response (BigInt is not serializable).
      expect(JSON.stringify(result.years)).not.toContain('chatId');
    });
  });

  describe('updateNote', () => {
    it('requires a string content', async () => {
      await expect(
        controller.updateNote(1, {} as { content?: string }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.note.updateMany).not.toHaveBeenCalled();
    });

    it('updates the note scoped to the chat and drops its embedding', async () => {
      prisma.note.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.updateNote(5, { content: 'edited' });

      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { id: 5, chatId: getDiaryChatId(), deletedAt: null },
        data: { content: 'edited' },
      });
      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { kind: 'note', refId: 5 },
      });
      expect(result).toEqual({ id: 5, content: 'edited' });
    });

    it('404s when no owned note matches', async () => {
      prisma.note.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        controller.updateNote(999, { content: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.embedding.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteNote', () => {
    it('soft-deletes and drops the search embedding', async () => {
      prisma.note.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.deleteNote(12);

      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { id: 12, chatId: getDiaryChatId(), deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { kind: 'note', refId: 12 },
      });
      expect(result).toEqual({ id: 12, deleted: true });
    });

    it('404s when the note is missing or already archived', async () => {
      prisma.note.updateMany.mockResolvedValue({ count: 0 });
      await expect(controller.deleteNote(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('restoreNote', () => {
    it('clears deletedAt for an archived note', async () => {
      prisma.note.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.restoreNote(12);

      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { id: 12, chatId: getDiaryChatId(), deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      expect(result).toEqual({ id: 12, restored: true });
    });
  });

  describe('archive', () => {
    it('lists soft-deleted notes newest first', async () => {
      prisma.note.findMany.mockResolvedValue([
        {
          id: 1,
          content: 'gone',
          deletedAt: new Date(),
          images: [],
          videos: [],
        },
      ]);

      const result = await controller.archive();

      expect(prisma.note.findMany).toHaveBeenCalledWith({
        where: { chatId: getDiaryChatId(), deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        select: expect.any(Object),
      });
      expect(result.notes).toHaveLength(1);
    });
  });

  describe('sendVideoToChat', () => {
    it('sends an owned video via Telegram', async () => {
      prisma.video.findFirst.mockResolvedValue({
        id: 3,
        url: 'https://spaces/v.mp4',
        note: { content: 'caption', noteDate: new Date('2007-08-01') },
      });

      const result = await controller.sendVideoToChat(3);

      expect(telegramBotService.sendDiaryVideo).toHaveBeenCalledWith(
        getDiaryChatIdNumber(),
        'https://spaces/v.mp4',
        'caption',
        new Date('2007-08-01'),
      );
      expect(result).toEqual({ id: 3, sent: true });
    });

    it('404s when the video is not owned', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      await expect(controller.sendVideoToChat(9)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateImage', () => {
    it('requires a string description', async () => {
      await expect(
        controller.updateImage(1, {} as { description?: string }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.image.updateMany).not.toHaveBeenCalled();
    });

    it('updates the image scoped via its note and drops the embedding', async () => {
      prisma.image.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.updateImage(7, { description: 'text' });

      expect(prisma.image.updateMany).toHaveBeenCalledWith({
        where: { id: 7, note: { chatId: getDiaryChatId(), deletedAt: null } },
        data: { description: 'text' },
      });
      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { kind: 'image', refId: 7 },
      });
      expect(result).toEqual({ id: 7, description: 'text' });
    });

    it('404s when no owned image matches', async () => {
      prisma.image.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        controller.updateImage(999, { description: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.embedding.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('updateVideo', () => {
    it('requires a string description', async () => {
      await expect(
        controller.updateVideo(1, {} as { description?: string }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.video.updateMany).not.toHaveBeenCalled();
    });

    it('updates the video scoped via its note (no embedding to drop)', async () => {
      prisma.video.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.updateVideo(9, { description: 'clip' });

      expect(prisma.video.updateMany).toHaveBeenCalledWith({
        where: { id: 9, note: { chatId: getDiaryChatId(), deletedAt: null } },
        data: { description: 'clip' },
      });
      expect(prisma.embedding.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 9, description: 'clip' });
    });

    it('404s when no owned video matches', async () => {
      prisma.video.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        controller.updateVideo(999, { description: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('describeImage', () => {
    it('404s when the image is not owned', async () => {
      prisma.image.findFirst.mockResolvedValue(null);

      await expect(controller.describeImage(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storageService.downloadFile).not.toHaveBeenCalled();
    });

    it('recognises, refines, persists and returns the description', async () => {
      prisma.image.findFirst.mockResolvedValue({
        id: 3,
        url: 'https://spaces/x.jpg',
        note: { content: 'дневник' },
      });
      storageService.downloadFile.mockResolvedValue(Buffer.from('img'));
      llmService.recognizeHandwriting.mockResolvedValue('чистый текст');

      const result = await controller.describeImage(3);

      expect(storageService.downloadFile).toHaveBeenCalledWith(
        'https://spaces/x.jpg',
      );
      expect(llmService.recognizeHandwriting).toHaveBeenCalledWith(
        expect.any(Buffer),
        'дневник',
        { reasoningEffort: 'medium' },
      );
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { description: 'чистый текст' },
      });
      expect(prisma.embedding.deleteMany).toHaveBeenCalledWith({
        where: { kind: 'image', refId: 3 },
      });
      expect(result).toEqual({ id: 3, description: 'чистый текст' });
    });

    it('does not persist an LLM failure sentinel', async () => {
      prisma.image.findFirst.mockResolvedValue({
        id: 4,
        url: 'https://spaces/y.jpg',
        note: { content: null },
      });
      storageService.downloadFile.mockResolvedValue(Buffer.from('img'));
      llmService.recognizeHandwriting.mockResolvedValue(
        'Не удалось описать изображение',
      );

      await expect(controller.describeImage(4)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.image.update).not.toHaveBeenCalled();
    });
  });
});
