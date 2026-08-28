import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';

describe('LlmService', () => {
  let service: LlmService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENAI_API_KEY') {
                return 'test-api-key';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('describeImage', () => {
    it('should return error message when API key is not defined', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      const result = await service.describeImage(Buffer.from('test'));
      expect(result).toBe('Ошибка конфигурации API ключа');
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () =>
          Promise.resolve(JSON.stringify({ error: 'Invalid API key' })),
      });

      const result = await service.describeImage(Buffer.from('test'));
      expect(result).toBe('Ошибка API OpenAI');
    });

    it('should accept assistant content as array of text parts (newer models)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: [{ type: 'text', text: '  Краткое описание  ' }],
                },
              },
            ],
          }),
      });

      const result = await service.describeImage(Buffer.from('test'));
      expect(result).toBe('Краткое описание');
    });

    it('should use enough completion budget for reasoning image models', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: 'Краткое описание',
                },
              },
            ],
          }),
      });

      await service.describeImage(Buffer.from('test'));

      const [, request] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(request.body);
      expect(body.max_completion_tokens).toBe(1600);
      expect(body.reasoning_effort).toBe('minimal');
    });

    it('should retry a timed-out request with gpt-5-mini', async () => {
      const timeoutError = Object.assign(new Error('timed out'), {
        name: 'TimeoutError',
      });
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  finish_reason: 'stop',
                  message: { content: 'Описание после повтора' },
                },
              ],
            }),
        });

      const result = await service.describeImage(Buffer.from('test'));

      expect(result).toBe('Описание после повтора');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [, fallbackRequest] = (global.fetch as jest.Mock).mock.calls[1];
      const fallbackBody = JSON.parse(fallbackRequest.body);
      expect(fallbackBody.model).toBe('gpt-5-mini');
      expect(fallbackBody.reasoning_effort).toBe('minimal');
    });

    it('should report a timeout when both description attempts time out', async () => {
      const timeoutError = () =>
        Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(timeoutError())
        .mockRejectedValueOnce(timeoutError());

      const result = await service.describeImage(Buffer.from('test'));

      expect(result).toBe('Превышено время ожидания ответа от OpenAI');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('recognizeHandwriting', () => {
    it('runs one vision pass per model and merges the drafts', async () => {
      const describe = jest
        .spyOn(service, 'describeImage')
        .mockResolvedValueOnce('вариант один')
        .mockResolvedValueOnce('вариант два')
        .mockResolvedValueOnce('вариант три');
      jest.spyOn(service, 'refineHandwrittenText').mockResolvedValue('итог');

      const result = await service.recognizeHandwriting(
        Buffer.from('img'),
        'контекст',
      );

      expect(describe).toHaveBeenCalledTimes(3);
      expect(describe.mock.calls.map((call) => call[3]?.model)).toEqual([
        'gpt-5',
        'gpt-5-mini',
        'gpt-4o',
      ]);
      expect(service.refineHandwrittenText).toHaveBeenCalledWith(
        [
          '--- Вариант (gpt-5) ---\nвариант один',
          '--- Вариант (gpt-5-mini) ---\nвариант два',
          '--- Вариант (gpt-4o) ---\nвариант три',
        ],
        'контекст',
      );
      expect(result).toBe('итог');
    });

    it('skips failure sentinels when merging', async () => {
      jest
        .spyOn(service, 'describeImage')
        .mockResolvedValueOnce('Не удалось описать изображение')
        .mockResolvedValueOnce('хороший текст')
        .mockResolvedValueOnce('Ошибка API OpenAI');
      jest.spyOn(service, 'refineHandwrittenText').mockResolvedValue('очищено');

      const result = await service.recognizeHandwriting(Buffer.from('img'));

      expect(service.refineHandwrittenText).toHaveBeenCalledWith(
        'хороший текст',
        undefined,
      );
      expect(result).toBe('очищено');
    });
  });
});
