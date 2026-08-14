import { Test, TestingModule } from '@nestjs/testing';
import { HistoryCommandsService } from './history-commands.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../services/storage.service';
import { PdfService } from '../services/pdf.service';
import { Context } from 'telegraf';

describe('HistoryCommandsService', () => {
  let service: HistoryCommandsService;

  const mockPrismaService = {
    note: {
      findMany: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockStorageService = {
    uploadFileWithKey: jest.fn(),
  };

  const mockPdfService = {
    renderHistoryPdf: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryCommandsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: PdfService,
          useValue: mockPdfService,
        },
      ],
    }).compile();

    service = module.get<HistoryCommandsService>(HistoryCommandsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleHistoryCommand', () => {
    it('should return early if no chatId', async () => {
      const mockReply = jest.fn();
      const mockContext = {
        chat: undefined,
        reply: mockReply,
      } as unknown as Context;

      await service.handleHistoryCommand(mockContext);

      expect(mockReply).not.toHaveBeenCalled();
    });

    it('should handle empty messages', async () => {
      const mockReply = jest.fn();
      const mockContext = {
        chat: { id: 123 },
        reply: mockReply,
      } as unknown as Context;

      mockPrismaService.note.findMany.mockResolvedValue([]);

      await service.handleHistoryCommand(mockContext);

      expect(mockReply).toHaveBeenCalledWith(
        'Нет сообщений длиннее 21 символов в этом чате.',
      );
    });

    it('should filter messages longer than 21 characters and upload to DO Space', async () => {
      const mockReply = jest.fn();
      const mockContext = {
        chat: { id: 123 },
        reply: mockReply,
      } as unknown as Context;

      const mockMessages = [
        {
          content: 'Short message',
          noteDate: new Date(),
          images: [],
          videos: [],
        },
        {
          content:
            'This is a much longer message that should be included in the history',
          noteDate: new Date(),
          images: [],
          videos: [],
        },
        {
          content: 'Another short one',
          noteDate: new Date(),
          images: [],
          videos: [],
        },
      ];

      mockPrismaService.note.findMany.mockResolvedValue(mockMessages);
      mockStorageService.uploadFileWithKey.mockResolvedValue(
        'https://fra1.digitaloceanspaces.com/vlandivir-2025/history/test-uuid.html',
      );

      await service.handleHistoryCommand(mockContext);

      expect(mockStorageService.uploadFileWithKey).toHaveBeenCalledWith(
        expect.any(Buffer),
        'text/html',
        expect.stringMatching(/^history\/[a-f0-9-]+\.html$/),
      );
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining(
          'История чата доступна по ссылке: https://fra1.digitaloceanspaces.com/vlandivir-2025/history/',
        ),
      );
    });

    it('should render a PDF and upload it when the command asks for pdf', async () => {
      const mockReply = jest.fn();
      const mockContext = {
        chat: { id: 123 },
        message: { text: '/history pdf' },
        reply: mockReply,
      } as unknown as Context;

      mockPrismaService.note.findMany.mockResolvedValue([
        {
          content:
            'This is a much longer message that should be included in the history',
          noteDate: new Date(),
          images: [],
          videos: [],
        },
      ]);
      mockPdfService.renderHistoryPdf.mockResolvedValue(
        Buffer.from('%PDF-fake'),
      );
      mockStorageService.uploadFileWithKey.mockResolvedValue(
        'https://fra1.digitaloceanspaces.com/vlandivir-2025/history/test-uuid.pdf',
      );

      await service.handleHistoryCommand(mockContext);

      expect(mockPdfService.renderHistoryPdf).toHaveBeenCalledTimes(1);
      expect(mockStorageService.uploadFileWithKey).toHaveBeenCalledWith(
        expect.any(Buffer),
        'application/pdf',
        expect.stringMatching(/^history\/[a-f0-9-]+\.pdf$/),
      );
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('История чата (PDF): '),
      );
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("test")</script>';
      const expected = '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;';

      const svc = service as unknown as { escapeHtml(text: string): string };
      const result = svc.escapeHtml(input);
      expect(result).toBe(expected);
    });
  });
});
