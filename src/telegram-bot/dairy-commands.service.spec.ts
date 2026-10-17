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

  describe('video send path', () => {
    it('summarizes huge captions and does not throw on long fallback', async () => {
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
      expect(replies.length).toBeGreaterThan(1);
      expect(replies.every((chunk) => chunk.length <= 4000)).toBe(true);
      expect(replies.join('')).toContain('⚠️');
      expect(replies.join('')).toContain(longContent.slice(0, 100));
    });

    it('sends summary caption then full text chunks when video succeeds', async () => {
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
      // Chunk splitter may drop the break whitespace between messages.
      expect(replies.join('')).toContain(longContent.slice(0, 80));
      expect(replies.every((chunk) => chunk.length <= 4000)).toBe(true);
      expect(replies.reduce((n, c) => n + c.length, 0)).toBeGreaterThan(
        longContent.length - replies.length,
      );
    });
  });
});
