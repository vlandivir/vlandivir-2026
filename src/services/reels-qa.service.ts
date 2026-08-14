import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';

export interface ReelsQaResult {
  answer: string;
  sources: { id: number; title: string | null; similarity: number }[];
}

const MAX_REEL_CHARS = 2000;
const MAX_CONTEXT_CHARS = 16000;
const QA_TIMEOUT_MS = 90 * 1000;

@Injectable()
export class ReelsQaService {
  private readonly logger = new Logger(ReelsQaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * RAG over the reels notebook: retrieve the most relevant reels,
   * answer strictly from them, referencing reels as [#id] so the UI
   * can turn references into links. Returns null when nothing matches.
   */
  async ask(question: string): Promise<ReelsQaResult | null> {
    const hits = await this.embeddingsService.search('reel', question, {
      limit: 10,
      minSimilarity: 0.25,
    });
    if (!hits.length) return null;

    const reels = await this.prisma.reel.findMany({
      where: { id: { in: hits.map((hit) => hit.refId) } },
    });
    const reelById = new Map(reels.map((reel) => [reel.id, reel]));

    let used = 0;
    const excerpts: string[] = [];
    const sources: ReelsQaResult['sources'] = [];
    for (const hit of hits) {
      const reel = reelById.get(hit.refId);
      if (!reel) continue;
      const content = [
        reel.title ? `Название: ${reel.title}` : null,
        reel.description ? `Описание: ${reel.description}` : null,
        reel.tags?.length ? `Теги: ${reel.tags.join(', ')}` : null,
        reel.transcriptClean || reel.transcript
          ? `Расшифровка речи: ${reel.transcriptClean || reel.transcript}`
          : null,
        reel.visionDescription
          ? `Что происходит на экране: ${reel.visionDescription}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_REEL_CHARS);
      const excerpt = `[#${reel.id}]\n${content}`;
      if (used + excerpt.length > MAX_CONTEXT_CHARS) break;
      used += excerpt.length;
      excerpts.push(excerpt);
      sources.push({
        id: reel.id,
        title: reel.title,
        similarity: hit.similarity,
      });
    }
    if (!excerpts.length) return null;

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
    const model =
      this.configService.get<string>('REELS_LLM_MODEL') || 'gpt-5-mini';

    const prompt = [
      'Ты помощник по личной записной книжке коротких видео (Instagram reels). Ниже выдержки из сохранённых роликов, отобранные поиском по вопросу пользователя.',
      'Ответь на вопрос кратко и по делу, опираясь ТОЛЬКО на эти выдержки. Когда ссылаешься на конкретный ролик, указывай его номер в формате [#id] — точно как в выдержках.',
      'Если в выдержках нет ответа, прямо скажи, что в записной книжке ничего подходящего не нашлось — не выдумывай.',
      '',
      `Вопрос: ${question}`,
      '',
      'Выдержки из роликов:',
      excerpts.join('\n\n---\n\n'),
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
        max_completion_tokens: 1500,
        reasoning_effort: 'minimal',
      }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Reels QA LLM error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error('Reels QA LLM returned no answer');
    }
    return { answer, sources };
  }
}
