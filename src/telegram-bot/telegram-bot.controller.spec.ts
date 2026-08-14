import { Test, TestingModule } from '@nestjs/testing';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DateParserService } from '../services/date-parser.service';
import { DairyCommandsService } from './dairy-commands.service';
import { StorageService } from '../services/storage.service';

describe('TelegramBotController', () => {
  let controller: TelegramBotController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramBotController],
      providers: [
        {
          provide: TelegramBotService,
          useValue: {
            startBot: jest.fn(),
            stopBot: jest.fn(),
            handleIncomingMessage: jest.fn(),
            handleIncomingPhoto: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock_token'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            note: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            botResponse: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: DateParserService,
          useValue: {
            extractDateFromFirstLine: jest.fn(),
          },
        },
        {
          provide: DairyCommandsService,
          useValue: {
            handleDairyCommand: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TelegramBotController>(TelegramBotController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
