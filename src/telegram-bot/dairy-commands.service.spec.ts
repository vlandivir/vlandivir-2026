import { Test, TestingModule } from '@nestjs/testing';
import { DairyCommandsService, splitTelegramTextChunks } from './dairy-commands.service';
import { PrismaService } from '../prisma/prisma.service';
import { DateParserService } from '../services/date-parser.service';
import { DebugLogService } from '../services/debug-log.service';
import { LlmService } from '../services/llm.service';

describe('splitTelegramTextChunks', () => {
  it('returns a single chunk when under the limit', () => {
    expect(splitTelegramTextChunks('short', 100)).toEqual(['short']);
  });

  it('splits on paragraph breaks when possible', () => {
    const a = 'A'.repeat(50);
    const b = 'B'.repeat(50);
    const text = `${a}\n\n${b}`;
    expect(splitTelegramTextChunks(text, 60)).toEqual([a, b]);
  });
});

describe('DairyCommandsService', () => {
  let service: DairyCommandsService;
  let llmService: { summarizeForTelegramCaption: jest.Mock };

  beforeEach(async () => {
    llmService = {
      summarizeForTelegramCaption: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DairyCommandsService,
        { provide: PrismaService, useValue: {} },
        { provide: DateParserService, useValue: {} },
        {
          provide: DebugLogService,
          useValue: { info: jest.fn(), warn: jest.fn() },
        },
        { provide: LlmService, useValue: llmService },
      ],
    }).compile();

    service = module.get(DairyCommandsService);
  });

  describe('captionForMedia', () => {
    it('passes short content through without summarizing', async () => {
      const result = await service.captionForMedia('короткая заметка');
      expect(result).toEqual({
        caption: 'короткая заметка',
        sendFullText: false,
      });
      expect(llmService.summarizeForTelegramCaption).not.toHaveBeenCalled();
    });

    it('uses AI summary for long content', async () => {
      const long = 'x'.repeat(900);
      llmService.summarizeForTelegramCaption.mockResolvedValue(
        'Краткое саммари',
      );

      const result = await service.captionForMedia(long);
      expect(llmService.summarizeForTelegramCaption).toHaveBeenCalledWith(long);
      expect(result).toEqual({
        caption: 'Краткое саммари',
        sendFullText: true,
      });
    });

    it('falls back to hard truncate when summary is empty', async () => {
      const long = 'y'.repeat(2000);
      llmService.summarizeForTelegramCaption.mockResolvedValue('');

      const result = await service.captionForMedia(long);
      expect(result.sendFullText).toBe(true);
      expect(result.caption?.endsWith('...')).toBe(true);
      expect(result.caption!.length).toBe(1024);
    });
  });

  describe('captionForVideo', () => {
    it('returns undefined caption when content is missing', async () => {
      const result = await service.captionForVideo(undefined);
      expect(result).toEqual({ caption: undefined, sendFullText: false });
      expect(llmService.summarizeForTelegramCaption).not.toHaveBeenCalled();
    });

    it('always summarizes short content and never sends full text', async () => {
      llmService.summarizeForTelegramCaption.mockResolvedValue('Короткое саммари');

      const result = await service.captionForVideo('короткая заметка');
      expect(llmService.summarizeForTelegramCaption).toHaveBeenCalledWith(
        'короткая заметка',
      );
      expect(result).toEqual({
        caption: 'Короткое саммари',
        sendFullText: false,
      });
    });

    it('uses AI summary for long content without sendFullText', async () => {
      const long = 'x'.repeat(900);
      llmService.summarizeForTelegramCaption.mockResolvedValue(
        'Саммари видео',
      );

      const result = await service.captionForVideo(long);
      expect(llmService.summarizeForTelegramCaption).toHaveBeenCalledWith(long);
      expect(result).toEqual({
        caption: 'Саммари видео',
        sendFullText: false,
      });
    });

    it('falls back to truncated caption when summary fails, still no full text', async () => {
      const long = 'y'.repeat(2000);
      llmService.summarizeForTelegramCaption.mockResolvedValue('');

      const result = await service.captionForVideo(long);
      expect(result.sendFullText).toBe(false);
      expect(result.caption?.endsWith('...')).toBe(true);
      expect(result.caption!.length).toBe(1024);
    });
  });

  describe('video send path', () => {
    it('falls back to summary caption plus URL, not full transcript', async () => {
      const longContent = 'reel transcript '.repeat(500);
      llmService.summarizeForTelegramCaption.mockResolvedValue(
        'Саммари рилса',
      );

      const replies: string[] = [];
      const ctx = {
        chat: { id: 1 },
        replyWithVideo: jest
          .fn()
          .mockRejectedValue(new Error('caption too long')),
        reply: jest.fn(async (text: string) => {
          replies.push(text);
        }),
      };

      await (service as any).sendOneDairyNote(ctx, {
        content: longContent,
        images: [],
        videos: [{ url: 'https://example.com/v.mp4' }],
      });

      expect(llmService.summarizeForTelegramCaption).toHaveBeenCalled();
      expect(ctx.replyWithVideo).toHaveBeenCalledWith(
        'https://example.com/v.mp4',
        { caption: 'Саммари рилса' },
      );
      expect(replies.length).toBe(1);
      expect(replies[0]).toContain('⚠️');
      expect(replies[0]).toContain('Саммари рилса');
      expect(replies[0]).toContain('https://example.com/v.mp4');
      expect(replies.join('')).not.toContain(longContent.slice(0, 100));
      expect(replies.every((chunk) => chunk.length <= 4000)).toBe(true);
    });

    it('sends summary caption only when video succeeds (no full-text reply)', async () => {
      const longContent = 'reel transcript '.repeat(500);
      llmService.summarizeForTelegramCaption.mockResolvedValue(
        'Саммари рилса',
      );

      const replies: string[] = [];
      const ctx = {
        chat: { id: 1 },
        replyWithVideo: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn(async (text: string) => {
          replies.push(text);
        }),
      };

      await (service as any).sendOneDairyNote(ctx, {
        content: longContent,
        images: [],
        videos: [{ url: 'https://example.com/v.mp4' }],
      });

      expect(ctx.replyWithVideo).toHaveBeenCalledWith(
        'https://example.com/v.mp4',
        { caption: 'Саммари рилса' },
      );
      expect(replies).toEqual([]);
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });
});
