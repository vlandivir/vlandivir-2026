import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ThreadsAiService } from './threads-ai.service';

const rewriteAction = {
  id: 1,
  label: 'Исправить орфографию',
  prompt: 'Исправь только орфографию.',
  responseMode: 'replace_text',
  model: 'gpt-5.6-terra',
  reasoningEffort: 'none',
  webSearch: false,
  enabled: true,
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ThreadsAiService', () => {
  const originalFetch = global.fetch;
  let prisma: {
    threadsAiAction: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: ThreadsAiService;

  beforeEach(() => {
    prisma = {
      threadsAiAction: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ThreadsAiService(
      prisma as never,
      {
        get: jest.fn((key: string) =>
          key === 'OPENAI_API_KEY' ? 'test-key' : undefined,
        ),
      } as never,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('requests a strict rewrite and returns text without saving the draft', async () => {
    prisma.threadsAiAction.findUnique.mockResolvedValue(rewriteAction);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      text: 'Привет, world',
                      message: 'Исправлена одна опечатка.',
                    }),
                  },
                ],
              },
            ],
          }),
        ),
    });

    await expect(service.runAction(1, 'Превет, world')).resolves.toEqual({
      kind: 'replace_text',
      text: 'Привет, world',
      message: 'Исправлена одна опечатка.',
    });

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.model).toBe('gpt-5.6-terra');
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(prisma.threadsAiAction.update).not.toHaveBeenCalled();
  });

  it('requires web search and returns inline citations for analysis', async () => {
    prisma.threadsAiAction.findUnique.mockResolvedValue({
      ...rewriteAction,
      id: 2,
      responseMode: 'analysis',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
      webSearch: true,
    });
    const answer = 'Белград — столица Сербии. [Источник]';
    const start = answer.indexOf('[Источник]');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            output: [
              {
                type: 'web_search_call',
                action: {
                  sources: [
                    {
                      type: 'url',
                      url: 'https://example.com/serbia',
                      title: 'Serbia',
                    },
                  ],
                },
              },
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: answer,
                    annotations: [
                      {
                        type: 'url_citation',
                        start_index: start,
                        end_index: answer.length,
                        url: 'https://example.com/serbia',
                        title: 'Serbia',
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        ),
    });

    const result = await service.runAction(2, 'Белград — столица Сербии.');

    expect(result).toEqual({
      kind: 'analysis',
      text: answer,
      citations: [
        {
          startIndex: start,
          endIndex: answer.length,
          url: 'https://example.com/serbia',
          title: 'Serbia',
        },
      ],
      sources: [{ url: 'https://example.com/serbia', title: 'Serbia' }],
    });
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.tools).toEqual([
      { type: 'web_search', search_context_size: 'medium' },
    ]);
    expect(body.tool_choice).toBe('required');
    expect(body.include).toEqual(['web_search_call.action.sources']);
  });

  it('rejects disabled actions and empty text before calling OpenAI', async () => {
    prisma.threadsAiAction.findUnique.mockResolvedValue({
      ...rewriteAction,
      enabled: false,
    });

    await expect(service.runAction(1, 'текст')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(global.fetch).toBe(originalFetch);

    prisma.threadsAiAction.findUnique.mockResolvedValue(rewriteAction);
    await expect(service.runAction(1, '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('validates catalog models', async () => {
    expect(() =>
      service.createAction({
        label: 'Test',
        prompt: 'Test prompt',
        model: 'unknown-model',
      }),
    ).toThrow(BadRequestException);
  });

  it('turns an OpenAI HTTP failure into a gateway error', async () => {
    prisma.threadsAiAction.findUnique.mockResolvedValue(rewriteAction);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: { message: 'Rate limit reached' } }),
        ),
    });

    await expect(service.runAction(1, 'Текст')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
