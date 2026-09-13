import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import {
  OpenAiReasoningEffort,
  REASONING_EFFORTS,
  THREADS_AI_MODELS,
  ThreadsAiModel,
} from '../openai-models';

export type ThreadsAiResponseMode = 'replace_text' | 'analysis';

export type ThreadsAiActionInput = {
  label?: string;
  prompt?: string;
  responseMode?: ThreadsAiResponseMode | string;
  model?: ThreadsAiModel | string;
  reasoningEffort?: OpenAiReasoningEffort | string;
  webSearch?: boolean;
  enabled?: boolean;
  sortOrder?: number;
};

type OpenAiAnnotation = {
  type?: string;
  start_index?: number;
  end_index?: number;
  url?: string;
  title?: string;
};

type OpenAiOutputText = {
  type?: string;
  text?: string;
  annotations?: OpenAiAnnotation[];
};

type OpenAiResponse = {
  output_text?: string;
  output?: {
    type?: string;
    content?: OpenAiOutputText[];
    action?: {
      sources?: { type?: string; url?: string; title?: string }[];
    };
  }[];
  error?: { message?: string };
};

const RESPONSE_MODES: ThreadsAiResponseMode[] = ['replace_text', 'analysis'];
const MAX_LABEL_LENGTH = 80;
const MAX_PROMPT_LENGTH = 12_000;
const MAX_TEXT_LENGTH = 30_000;
const OPENAI_TIMEOUT_MS = 120_000;

@Injectable()
export class ThreadsAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  listActions() {
    return this.prisma.threadsAiAction.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  createAction(input: ThreadsAiActionInput) {
    const data = this.normalizeAction(input, false);
    return this.prisma.threadsAiAction.create({
      data: data as Prisma.ThreadsAiActionCreateInput,
    });
  }

  async updateAction(id: number, input: ThreadsAiActionInput) {
    await this.requireAction(id);
    const data = this.normalizeAction(input, true);
    return this.prisma.threadsAiAction.update({ where: { id }, data });
  }

  async deleteAction(id: number) {
    await this.requireAction(id);
    await this.prisma.threadsAiAction.delete({ where: { id } });
    return { deleted: true };
  }

  async runAction(id: number, rawText: unknown) {
    const action = await this.requireAction(id);
    if (!action.enabled) {
      throw new BadRequestException('AI action is disabled');
    }
    const text = this.requiredText(rawText);
    const payload = await this.callOpenAi(action, text);

    if (action.responseMode === 'replace_text') {
      const output = this.extractOutputText(payload);
      let parsed: { text?: unknown; message?: unknown };
      try {
        parsed = JSON.parse(output);
      } catch {
        throw new BadGatewayException('OpenAI returned invalid rewrite JSON');
      }
      if (typeof parsed.text !== 'string') {
        throw new BadGatewayException('OpenAI rewrite did not return text');
      }
      return {
        kind: 'replace_text' as const,
        text: parsed.text,
        message: typeof parsed.message === 'string' ? parsed.message : '',
      };
    }

    const answer = this.extractOutputText(payload);
    const citations = this.extractCitations(payload, answer);
    return {
      kind: 'analysis' as const,
      text: answer,
      citations,
      sources: this.extractSources(payload, citations),
    };
  }

  private async requireAction(id: number) {
    const action = await this.prisma.threadsAiAction.findUnique({
      where: { id },
    });
    if (!action) throw new NotFoundException('AI action not found');
    return action;
  }

  private normalizeAction(input: ThreadsAiActionInput, partial: boolean) {
    const data: {
      label?: string;
      prompt?: string;
      responseMode?: string;
      model?: string;
      reasoningEffort?: string;
      webSearch?: boolean;
      enabled?: boolean;
      sortOrder?: number;
    } = {};

    if (!partial || input.label !== undefined) {
      const label = String(input.label || '').trim();
      if (!label) throw new BadRequestException('label is required');
      if (label.length > MAX_LABEL_LENGTH) {
        throw new BadRequestException(
          `label must be at most ${MAX_LABEL_LENGTH} characters`,
        );
      }
      data.label = label;
    }
    if (!partial || input.prompt !== undefined) {
      const prompt = String(input.prompt || '').trim();
      if (!prompt) throw new BadRequestException('prompt is required');
      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new BadRequestException(
          `prompt must be at most ${MAX_PROMPT_LENGTH} characters`,
        );
      }
      data.prompt = prompt;
    }
    if (!partial || input.responseMode !== undefined) {
      const mode = input.responseMode || 'analysis';
      if (!RESPONSE_MODES.includes(mode as ThreadsAiResponseMode)) {
        throw new BadRequestException(
          `responseMode must be one of: ${RESPONSE_MODES.join(', ')}`,
        );
      }
      data.responseMode = mode;
    }
    if (!partial || input.model !== undefined) {
      const model = input.model || THREADS_AI_MODELS[1];
      if (!THREADS_AI_MODELS.includes(model as ThreadsAiModel)) {
        throw new BadRequestException(
          `model must be one of: ${THREADS_AI_MODELS.join(', ')}`,
        );
      }
      data.model = model;
    }
    if (!partial || input.reasoningEffort !== undefined) {
      const effort = input.reasoningEffort || 'none';
      if (!REASONING_EFFORTS.includes(effort as OpenAiReasoningEffort)) {
        throw new BadRequestException(
          `reasoningEffort must be one of: ${REASONING_EFFORTS.join(', ')}`,
        );
      }
      data.reasoningEffort = effort;
    }
    if (!partial || input.webSearch !== undefined) {
      data.webSearch = Boolean(input.webSearch);
    }
    if (!partial || input.enabled !== undefined) {
      data.enabled =
        input.enabled === undefined ? true : Boolean(input.enabled);
    }
    if (!partial || input.sortOrder !== undefined) {
      const sortOrder = input.sortOrder ?? 0;
      if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 1_000_000) {
        throw new BadRequestException('sortOrder must be an integer');
      }
      data.sortOrder = sortOrder;
    }
    return data;
  }

  private requiredText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('text is required');
    }
    if (value.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(
        `text must be at most ${MAX_TEXT_LENGTH} characters`,
      );
    }
    return value;
  }

  private async callOpenAi(
    action: {
      prompt: string;
      responseMode: string;
      model: string;
      reasoningEffort: string;
      webSearch: boolean;
    },
    text: string,
  ): Promise<OpenAiResponse> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not defined');

    const rewrite = action.responseMode === 'replace_text';
    const body: Record<string, unknown> = {
      model: action.model,
      instructions: [
        action.prompt,
        rewrite
          ? 'Return the complete resulting text and a concise message with recommendations. The text field is the only value the application may put into the editor. Follow the requested editing scope exactly.'
          : 'Return a concise, useful analysis. When web search is enabled, cite factual claims with the sources supplied by web search.',
      ].join('\n\n'),
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      ],
      reasoning: { effort: action.reasoningEffort },
      max_output_tokens: rewrite ? 8_000 : 5_000,
    };

    if (rewrite) {
      body.text = {
        format: {
          type: 'json_schema',
          name: 'threads_text_rewrite',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['text', 'message'],
            additionalProperties: false,
          },
        },
      };
    }
    if (action.webSearch) {
      body.tools = [{ type: 'web_search', search_context_size: 'medium' }];
      body.tool_choice = 'required';
      body.include = ['web_search_call.action.sources'];
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    const raw = await response.text();
    let payload: OpenAiResponse = {};
    try {
      payload = raw ? (JSON.parse(raw) as OpenAiResponse) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const message = payload.error?.message || raw || response.statusText;
      throw new BadGatewayException(
        `OpenAI Responses API error (${response.status}): ${message.slice(0, 300)}`,
      );
    }
    return payload;
  }

  private outputParts(payload: OpenAiResponse): OpenAiOutputText[] {
    return (payload.output || []).flatMap((item) =>
      Array.isArray(item.content) ? item.content : [],
    );
  }

  private extractOutputText(payload: OpenAiResponse): string {
    const direct = payload.output_text?.trim();
    if (direct) return direct;
    const text = this.outputParts(payload)
      .filter((part) => part.type === 'output_text' && part.text)
      .map((part) => part.text)
      .join('')
      .trim();
    if (!text) throw new BadGatewayException('OpenAI returned no text');
    return text;
  }

  private extractCitations(payload: OpenAiResponse, text: string) {
    const citations = this.outputParts(payload).flatMap((part) =>
      (part.annotations || [])
        .filter(
          (item) =>
            item.type === 'url_citation' &&
            typeof item.url === 'string' &&
            typeof item.start_index === 'number' &&
            typeof item.end_index === 'number',
        )
        .map((item) => ({
          startIndex: Math.max(0, Math.min(text.length, item.start_index!)),
          endIndex: Math.max(0, Math.min(text.length, item.end_index!)),
          url: item.url!,
          title: item.title || item.url!,
        })),
    );
    return citations
      .filter((item) => item.endIndex > item.startIndex)
      .sort((a, b) => a.startIndex - b.startIndex);
  }

  private extractSources(
    payload: OpenAiResponse,
    citations: { url: string; title: string }[],
  ) {
    const sources = (payload.output || []).flatMap(
      (item) => item.action?.sources || [],
    );
    const all = [
      ...sources
        .filter((item) => typeof item.url === 'string')
        .map((item) => ({ url: item.url!, title: item.title || item.url! })),
      ...citations.map((item) => ({ url: item.url, title: item.title })),
    ];
    return [...new Map(all.map((item) => [item.url, item] as const)).values()];
  }
}
