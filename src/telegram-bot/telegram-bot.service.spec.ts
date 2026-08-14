import { Test, TestingModule } from '@nestjs/testing';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DateParserService } from '../services/date-parser.service';
import { DairyCommandsService } from './dairy-commands.service';
import { FindCommandsService } from './find-commands.service';
import { StorageService } from '../services/storage.service';
import { LlmService } from '../services/llm.service';
import { SerbianCommandsService } from './serbian-commands.service';
import { ForeignCommandsService } from './foreign-commands.service';
import { HistoryCommandsService } from './history-commands.service';
import { CollageCommandsService } from './collage-commands.service';
import { Context } from 'telegraf';
import { DebugLogService } from '../services/debug-log.service';
import { ReelsService } from '../services/reels.service';

describe('TelegramBotService', () => {
  let service: TelegramBotService;

  const mockReply = jest.fn();
  const baseContext = {
    chat: {
      id: 123456,
      type: 'private',
    },
    telegram: {
      getFile: jest.fn().mockResolvedValue({ file_path: 'test/path' }),
    },
    reply: mockReply,
    updateType: 'message',
    me: {
      id: 123,
      is_bot: true,
      first_name: 'TestBot',
      username: 'test_bot',
    },
    tg: {
      getFile: jest.fn().mockResolvedValue({ file_path: 'test/path' }),
    },
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: 'TestBot',
      username: 'test_bot',
    },
  };

  const mockPhotoContext = {
    ...baseContext,
    message: {
      text: 'test message',
      photo: [
        {
          file_id: 'test-file-id',
          width: 100,
          height: 100,
        },
      ],
      caption: 'test caption',
    },
  } as unknown as Context;

  const mockVideoContext = {
    ...baseContext,
    message: {
      video: {
        file_id: 'test-video-id',
        width: 100,
        height: 100,
        duration: 1,
      },
      caption: 'video caption',
    },
  } as unknown as Context;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'VLANDIVIR_2025_WEBHOOK_URL') {
                return 'https://example.com/telegram-bot';
              }
              return 'mock_token';
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            note: {
              create: jest.fn().mockResolvedValue({
                id: 1,
                content: 'test content',
              }),
              findMany: jest.fn(),
            },
            botResponse: {
              create: jest.fn(),
            },
            reel: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ id: 7, shortcode: 'abc' }),
              update: jest.fn().mockResolvedValue({ id: 7, shortcode: 'abc' }),
            },
          },
        },
        {
          provide: DateParserService,
          useValue: {
            extractDateFromFirstLine: jest.fn().mockReturnValue({
              date: new Date(),
              cleanContent: 'test content',
            }),
          },
        },
        {
          provide: DairyCommandsService,
          useValue: {
            handleDairyCommand: jest.fn(),
          },
        },
        {
          provide: FindCommandsService,
          useValue: {
            handleFindCommand: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest
              .fn()
              .mockImplementation((buffer, mimeType, chatId) =>
                Promise.resolve(
                  `https://example.com/chats/${chatId}/images/mock-uuid`,
                ),
              ),
            uploadVideo: jest
              .fn()
              .mockImplementation((buffer, mimeType, chatId) =>
                Promise.resolve(
                  `https://example.com/chats/${chatId}/videos/mock-uuid`,
                ),
              ),
          },
        },
        {
          provide: LlmService,
          useValue: {
            describeImage: jest.fn().mockResolvedValue('test description'),
          },
        },
        {
          provide: SerbianCommandsService,
          useValue: {
            handleSerbianCommand: jest.fn(),
          },
        },
        {
          provide: ForeignCommandsService,
          useValue: {
            handleForeignCommand: jest.fn(),
          },
        },
        {
          provide: HistoryCommandsService,
          useValue: {
            handleHistoryCommand: jest.fn(),
          },
        },
        {
          provide: CollageCommandsService,
          useValue: {
            handleCollageCommand: jest.fn(),
            startConversation: jest.fn(),
            addImage: jest.fn(),
            cancel: jest.fn(),
            generate: jest.fn(),
            isActive: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: DebugLogService,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
        {
          provide: ReelsService,
          useValue: {
            extractShortcode: jest
              .fn()
              .mockImplementation(
                (url: string) =>
                  /instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(
                    url,
                  )?.[1] ?? null,
              ),
            processInBackground: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramBotService>(TelegramBotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle photo messages', async () => {
    await service.handleIncomingPhoto(mockPhotoContext);
    expect(mockReply).toHaveBeenCalled();
  });

  it('should handle channel posts', async () => {
    const channelReply = jest.fn();
    const channelContext = {
      ...mockPhotoContext,
      channelPost: {
        ...mockPhotoContext.message,
        chat: { id: -1001234567890, type: 'channel', title: 'Test Channel' },
      },
      updateType: 'channel_post',
      reply: channelReply,
    } as unknown as Context;

    await service.handleIncomingPhoto(channelContext);
    expect(channelReply).toHaveBeenCalled();
  });

  it('should handle video messages', async () => {
    await service.handleIncomingVideo(mockVideoContext);
    expect(mockReply).toHaveBeenCalled();
  });

  it('saves a reel link to the reels notebook', async () => {
    const prisma = (
      service as unknown as {
        prisma: {
          reel: { create: jest.Mock; findUnique: jest.Mock };
        };
      }
    ).prisma;
    const reels = (
      service as unknown as {
        reelsService: { processInBackground: jest.Mock };
      }
    ).reelsService;
    const sendMessage = jest.fn();
    (
      service as unknown as { bot: { telegram: { sendMessage: jest.Mock } } }
    ).bot.telegram.sendMessage = sendMessage;

    const handled = await service.handleReelLink(
      123456,
      'https://www.instagram.com/reel/CxYz123_ab/',
    );

    expect(handled).toBe(true);
    expect(prisma.reel.findUnique).toHaveBeenCalledWith({
      where: { shortcode: 'CxYz123_ab' },
    });
    expect(prisma.reel.create).toHaveBeenCalledWith({
      data: {
        instagramUrl: 'https://www.instagram.com/reel/CxYz123_ab/',
        shortcode: 'CxYz123_ab',
        source: 'notebook',
      },
    });
    expect(reels.processInBackground).toHaveBeenCalledWith(
      7,
      expect.any(Function),
    );
    expect(sendMessage).toHaveBeenCalled();
  });

  it('notifies with a share link and info once a reel is processed', async () => {
    const prisma = (
      service as unknown as { prisma: { reel: { findUnique: jest.Mock } } }
    ).prisma;
    prisma.reel.findUnique.mockResolvedValueOnce({
      id: 7,
      shortcode: 'CxYz123_ab',
      status: 'ready',
      title: 'Крутой рецепт пасты',
      author: 'chef_mario',
      duration: 65,
      tags: ['рецепты', 'быстрая еда'],
      error: null,
    });
    const sendMessage = jest.fn();
    (
      service as unknown as { bot: { telegram: { sendMessage: jest.Mock } } }
    ).bot.telegram.sendMessage = sendMessage;

    await service.notifyReelProcessed(123456, 7);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const message = sendMessage.mock.calls[0][1] as string;
    expect(message).toContain('Крутой рецепт пасты');
    expect(message).toContain('chef_mario');
    expect(message).toContain('1:05');
    expect(message).toContain('#рецепты');
    expect(message).toContain('#быстрая_еда');
    expect(message).toContain('https://example.com/reels/7');
  });

  it('reports a processing failure to the user', async () => {
    const prisma = (
      service as unknown as { prisma: { reel: { findUnique: jest.Mock } } }
    ).prisma;
    prisma.reel.findUnique.mockResolvedValueOnce({
      id: 8,
      shortcode: 'CxYz123_ab',
      status: 'error',
      error: 'yt-dlp is not installed on the server',
      title: null,
      author: null,
      duration: null,
      tags: [],
    });
    const sendMessage = jest.fn();
    (
      service as unknown as { bot: { telegram: { sendMessage: jest.Mock } } }
    ).bot.telegram.sendMessage = sendMessage;

    await service.notifyReelProcessed(123456, 8);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const message = sendMessage.mock.calls[0][1] as string;
    expect(message).toContain('Не удалось обработать рилс');
    expect(message).toContain('yt-dlp is not installed');
  });

  it('does not create a duplicate reel for an already saved link', async () => {
    const prisma = (
      service as unknown as {
        prisma: {
          reel: { create: jest.Mock; findUnique: jest.Mock };
        };
      }
    ).prisma;
    prisma.reel.findUnique.mockResolvedValueOnce({
      id: 5,
      shortcode: 'CxYz123_ab',
      status: 'ready',
    });
    const sendMessage = jest.fn();
    (
      service as unknown as { bot: { telegram: { sendMessage: jest.Mock } } }
    ).bot.telegram.sendMessage = sendMessage;

    const handled = await service.handleReelLink(
      123456,
      'https://www.instagram.com/reel/CxYz123_ab/',
    );

    expect(handled).toBe(true);
    expect(prisma.reel.create).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('ignores messages without a reel link', async () => {
    const handled = await service.handleReelLink(123456, 'just a note');
    expect(handled).toBe(false);
  });

  it('should return sorted help message', () => {
    const svc = service as unknown as { getHelpMessage(): string };
    const result = svc.getHelpMessage();
    const expected = [
      '/a - Open GTD Mini App',
      '/bar - Distance to Pivski Zabavnik',
      '/c or /collage - Create image collage',
      '/d or /dairy - Dairy Notes',
      '/dl or /debuglog - Export in-memory debug log',
      '/f or /find - Semantic search over notes',
      '/help - Show this help message',
      '/history - Chat History',
      '/p or /phrase - Translate between RU/EN/SR',
      '/q or /ask - Answer a question from the diary',
      '/s - Serbian Translation',
    ].join('\n');
    expect(result).toBe(expected);
  });
});
