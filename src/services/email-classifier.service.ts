import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ClassifierRule = {
  id: number;
  condition: string;
  priority: number;
};

export type ClassifierMessage = {
  fromName?: string | null;
  fromAddress?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  labels?: string[];
};

export type ClassifierResult = {
  matchedRuleId: number | null;
  confidence: number; // 0..1
  reasoning: string;
};

const TIMEOUT_MS = 30_000;
const BODY_LIMIT = 4000;

// Decides which catalog rule (if any) applies to a message. Evaluation only —
// it never applies effects; the caller does that. Uses OpenAI to match the
// project's existing LLM setup (OPENAI_API_KEY).
@Injectable()
export class EmailClassifierService {
  private readonly logger = new Logger(EmailClassifierService.name);

  constructor(private readonly configService: ConfigService) {}

  async evaluate(
    message: ClassifierMessage,
    rules: ClassifierRule[],
  ): Promise<ClassifierResult> {
    if (rules.length === 0) {
      return { matchedRuleId: null, confidence: 1, reasoning: 'Нет правил' };
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not defined');
    const model =
      this.configService.get<string>('EMAIL_LLM_MODEL') || 'gpt-5-mini';

    // Rules are passed highest-priority first; the model returns the first
    // (highest-priority) one whose condition matches.
    const ruleLines = rules
      .map(
        (rule) => `#${rule.id} (приоритет ${rule.priority}): ${rule.condition}`,
      )
      .join('\n');

    const body = (message.bodyText || '').slice(0, BODY_LIMIT);
    const prompt = [
      'Ты классификатор входящей почты. Ниже правила (по убыванию приоритета) и одно письмо.',
      'Определи, подходит ли письмо под какое-либо правило. Если подходит несколько — верни ПЕРВОЕ по списку (высший приоритет).',
      'Отвечай строго JSON-объектом: {"matchedRuleId": <число или null>, "confidence": <0..1>, "reasoning": "<кратко по-русски>"}.',
      'Если ни одно правило не подходит — matchedRuleId = null. Не выдумывай совпадений.',
      'Совпадение только при явном выполнении условия по отправителю, теме или тексту. Сомнения → matchedRuleId = null.',
      'Не расширяй условие по ассоциации (например, любой GitHub PR ≠ письма от конкретного GitHub-аккаунта/организации; календарное приглашение ≠ правило про GitHub).',
      'confidence ставь высоким (≥0.9) только при очевидном совпадении; иначе лучше matchedRuleId = null.',
      '',
      'Правила:',
      ruleLines,
      '',
      'Письмо:',
      `Отправитель: ${message.fromName || ''} <${message.fromAddress || ''}>`,
      `Тема: ${message.subject || ''}`,
      `Ярлыки: ${(message.labels || []).join(', ') || '—'}`,
      `Текст: ${body}`,
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 500,
        reasoning_effort: 'minimal',
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Email classifier LLM error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Email classifier returned no content');

    return this.parseResult(content, rules);
  }

  private parseResult(
    content: string,
    rules: ClassifierRule[],
  ): ClassifierResult {
    let parsed: {
      matchedRuleId?: number | null;
      confidence?: number;
      reasoning?: string;
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.warn(
        `Classifier returned non-JSON: ${content.slice(0, 200)}`,
      );
      return {
        matchedRuleId: null,
        confidence: 0,
        reasoning: content.slice(0, 300),
      };
    }

    // Only accept an id that is actually one of the offered rules
    const validId =
      typeof parsed.matchedRuleId === 'number' &&
      rules.some((rule) => rule.id === parsed.matchedRuleId)
        ? parsed.matchedRuleId
        : null;

    return {
      matchedRuleId: validId,
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0,
      reasoning: (parsed.reasoning || '').slice(0, 500),
    };
  }
}
