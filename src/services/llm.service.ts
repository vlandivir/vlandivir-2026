import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OPENAI_MODELS } from '../openai-models';
import { DebugLogService } from './debug-log.service';

/** OpenAI assistant message.content may be a string or an array of text/refusal parts. */
function extractTextFromAssistantContent(content: unknown): {
  text: string | null;
  refusals: string[];
} {
  const refusals: string[] = [];
  if (content === null || content === undefined) {
    return { text: null, refusals };
  }
  if (typeof content === 'string') {
    const t = content.trim();
    return { text: t.length > 0 ? t : null, refusals };
  }
  if (!Array.isArray(content)) {
    return { text: null, refusals };
  }
  const texts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const p = part as { type?: string; text?: string; refusal?: string };
    if (p.type === 'text' && typeof p.text === 'string') {
      texts.push(p.text);
    } else if (p.type === 'refusal' && typeof p.refusal === 'string') {
      refusals.push(p.refusal);
    }
  }
  const joined = texts.join('').trim();
  return { text: joined.length > 0 ? joined : null, refusals };
}

const IMAGE_DESCRIPTION_MAX_COMPLETION_TOKENS = 1600;
const TEXT_REFINE_MAX_COMPLETION_TOKENS = 1600;
const TELEGRAM_CAPTION_SUMMARY_MAX_COMPLETION_TOKENS = 500;
const TELEGRAM_CAPTION_SUMMARY_TIMEOUT_MS = 30_000;
/** Cap input sent to the summarizer so huge reel transcripts stay cheap. */
const TELEGRAM_CAPTION_SUMMARY_INPUT_MAX_CHARS = 12_000;

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

// Three OpenAI vision models with different error patterns — consensus beats
// three identical draws. Override via HANDWRITING_LLM_MODELS=a,b,c.
const DEFAULT_HANDWRITING_MODELS = [
  OPENAI_MODELS.highAccuracy,
  OPENAI_MODELS.balanced,
  OPENAI_MODELS.economical,
] as const;

function supportsReasoningEffort(model: string): boolean {
  return /^(gpt-5|o[0-9])/i.test(model);
}

export interface DescribeImageOptions {
  // Emphasise careful transcription of handwritten text (e.g. diary pages).
  handwriting?: boolean;
  // Higher effort recognises messy handwriting better, at the cost of latency.
  reasoningEffort?: ReasoningEffort;
  // Override the default 30s fetch abort (handwriting + medium effort needs more).
  timeoutMs?: number;
  // Chat-completions model id (default: current high-accuracy model).
  model?: string;
}

export interface RecognizeHandwritingOptions {
  // Vision models for independent passes (default: Sol, Terra and Luna).
  models?: string[];
  reasoningEffort?: ReasoningEffort;
}

// describeImage never throws — on failure it returns one of these Russian
// sentinels. Callers must not persist them as a real description.
export const DESCRIBE_FAILURE_SENTINELS = [
  'Не удалось описать изображение',
  'Не удалось получить описание от OpenAI',
  'Превышено время ожидания ответа от OpenAI',
  'Ошибка конфигурации API ключа',
  'Ошибка API OpenAI',
  'Неожиданный формат ответа от OpenAI',
  'Модель отказалась описать изображение',
  'Ошибка при обработке ответа от OpenAI',
] as const;

function isDescribeFailure(text: string): boolean {
  return (DESCRIBE_FAILURE_SENTINELS as readonly string[]).includes(
    text.trim(),
  );
}

@Injectable()
export class LlmService {
  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly debugLogService?: DebugLogService,
  ) {}

  async describeImage(
    imageBuffer: Buffer,
    comment?: string,
    noteContext?: string,
    options?: DescribeImageOptions,
  ): Promise<string> {
    const primaryResult = await this.describeImageOnce(
      imageBuffer,
      comment,
      noteContext,
      options,
    );

    if (primaryResult !== 'Превышено время ожидания ответа от OpenAI') {
      return primaryResult;
    }

    const primaryModel = options?.model?.trim() || OPENAI_MODELS.highAccuracy;
    const fallbackModel = OPENAI_MODELS.balanced;
    if (primaryModel === fallbackModel) {
      return primaryResult;
    }

    this.debugLogService?.warn(
      'llm.describeImage',
      'Primary model timed out; retrying with fallback model',
      {
        primaryModel,
        fallbackModel,
        fallbackTimeoutMs: 20_000,
      },
    );

    return this.describeImageOnce(imageBuffer, comment, noteContext, {
      ...options,
      model: fallbackModel,
      reasoningEffort: 'none',
      timeoutMs: 20_000,
    });
  }

  private async describeImageOnce(
    imageBuffer: Buffer,
    comment?: string,
    noteContext?: string,
    options?: DescribeImageOptions,
  ): Promise<string> {
    const handwriting = options?.handwriting ?? false;
    const reasoningEffort: ReasoningEffort = options?.reasoningEffort ?? 'none';
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const model = options?.model?.trim() || OPENAI_MODELS.highAccuracy;
    try {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not defined');
      }

      this.debugLogService?.info(
        'llm.describeImage',
        'Starting image description',
        {
          imageBytes: imageBuffer.length,
          hasComment: Boolean(comment && comment.trim()),
          handwriting,
          reasoningEffort,
          timeoutMs,
          model,
        },
      );

      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');

      // Create timeout signal with fallback for older Node.js versions
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutSignal =
        typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(timeoutMs)
          : (() => {
              const controller = new AbortController();
              timeoutId = setTimeout(() => controller.abort(), timeoutMs);
              return controller.signal;
            })();

      try {
        const response = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: [
                        'Опиши это изображение на русском языке — точно и подробно, так чтобы по описанию его можно было найти текстовым поиском.',
                        handwriting
                          ? 'На изображении, скорее всего, рукописный текст (например, страница дневника). Твоя главная задача — как можно точнее расшифровать этот текст.'
                          : null,
                        handwriting
                          ? 'Внимательно, строка за строкой, разбери рукописный текст дословно, сохраняя порядок строк и абзацы. Учитывай особенности почерка и контекст соседних слов, чтобы правильно прочитать неразборчивые буквы.'
                          : null,
                        handwriting
                          ? 'Если слово прочитать уверенно не удаётся, приведи наиболее вероятный вариант и пометь его вопросительным знаком в скобках, например: слово(?).'
                          : null,
                        handwriting
                          ? 'Сначала выпиши полную расшифровку рукописного текста, затем отдельным абзацем кратко опиши, что ещё видно на изображении (обстановку, рисунки, схемы).'
                          : 'Сначала один абзац: что происходит, кто и что видно, обстановка, место, сезон и время суток, если их можно определить.',
                        handwriting
                          ? null
                          : 'Затем выпиши дословно весь видимый текст (вывески, этикетки, меню, экраны, документы) на языке оригинала.',
                        'Назови конкретные объекты, бренды, названия мест и блюд, породы животных и виды растений, если уверенно их узнаёшь.',
                        'Не используй слова "фотография" или "изображение" и вводных конструкций, сразу описывай что видишь.',
                        'Не выдумывай деталей, которых не видно, и не делай обобщений о настроении.',
                        comment ? `Комментарий пользователя: ${comment}` : null,
                        noteContext
                          ? `Текст заметки, к которой приложено изображение (используй как контекст, но описывай то, что видно): ${noteContext}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' '),
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`,
                      },
                    },
                  ],
                },
              ],
              max_completion_tokens: IMAGE_DESCRIPTION_MAX_COMPLETION_TOKENS,
              ...(supportsReasoningEffort(model)
                ? { reasoning_effort: reasoningEffort }
                : {}),
            }),
            signal: timeoutSignal,
          },
        );

        // Clear timeout if request completes successfully
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          let errorBody: unknown;
          const raw = await response.text();
          try {
            errorBody = raw ? JSON.parse(raw) : null;
          } catch {
            errorBody = raw?.slice(0, 2000) ?? null;
          }
          console.error('OpenAI API error:', errorBody);
          this.debugLogService?.error(
            'llm.describeImage',
            'OpenAI HTTP error',
            {
              status: response.status,
              statusText: response.statusText,
              body: errorBody,
            },
          );
          throw new Error(
            `OpenAI API error: ${response.status} ${response.statusText}`,
          );
        }

        const data: unknown = await response.json();

        // Validate the response structure
        if (!data || typeof data !== 'object') {
          console.error('Invalid OpenAI response - not an object:', data);
          throw new Error('Invalid response format from OpenAI');
        }

        const responseData = data as {
          choices?: {
            message?: {
              content?: string;
            };
          }[];
          error?: unknown;
        };

        // Check for OpenAI API errors in the response body
        if (responseData.error) {
          console.error(
            'OpenAI API error in response body:',
            responseData.error,
          );
          this.debugLogService?.error(
            'llm.describeImage',
            'OpenAI error field in 200 body',
            { error: responseData.error },
          );
          throw new Error('OpenAI API returned an error');
        }

        // Add detailed logging to understand the response structure
        console.log('OpenAI API response:', JSON.stringify(data, null, 2));

        if (
          !responseData.choices ||
          !Array.isArray(responseData.choices) ||
          responseData.choices.length === 0
        ) {
          console.error(
            'Unexpected OpenAI response structure - no choices array or empty choices:',
            responseData,
          );
          this.debugLogService?.error(
            'llm.describeImage',
            'No choices in OpenAI response',
            {
              keys:
                data && typeof data === 'object'
                  ? Object.keys(data as object)
                  : [],
            },
          );
          throw new Error(
            'Invalid response structure from OpenAI - no choices available',
          );
        }

        const choice = responseData.choices[0] as {
          finishReason?: string;
          message?: { content?: unknown };
        };
