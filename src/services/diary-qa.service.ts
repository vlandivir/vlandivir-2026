import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DiarySearchService } from './diary-search.service';

// Enough for ~15 notes without blowing up the prompt
const MAX_CONTEXT_CHARS = 16000;
const MAX_NOTE_CHARS = 1500;
const QA_TIMEOUT_MS = 90 * 1000;

@Injectable()
export class DiaryQaService {
  private readonly logger = new Logger(DiaryQaService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly diarySearch: DiarySearchService,
  ) {}

  /**
   * Answer a question from the chat's diary: retrieve the most relevant
   * notes semantically, then let the LLM answer strictly from them.
   * Returns null when nothing relevant was found.
   */
  async answer(chatId: bigint, question: string): Promise<string | null> {
    const hits = await this.diarySearch.retrieve(chatId, question, 12);
    if (!hits.length) return null;

    let used = 0;
    const excerpts: string[] = [];
    for (const hit of hits) {
      const dateStr = format(hit.noteDate, 'd MMMM yyyy', { locale: ru });
      const text = hit.content.slice(0, MAX_NOTE_CHARS);
      const excerpt = `[${dateStr}]\n${text}`;
      if (used + excerpt.length > MAX_CONTEXT_CHARS) break;
      used += excerpt.length;
      excerpts.push(excerpt);
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
    const model =
      this.configService.get<string>('DIARY_LLM_MODEL') || 'gpt-5-mini';

    const prompt = [
      'Ты помощник по личному дневнику. Ниже выдержки из заметок пользователя с датами, отобранные поиском по его вопросу.',
      `Сегодняшняя дата: ${format(new Date(), 'd MMMM yyyy', { locale: ru })}.`,
      'Ответь на вопрос, опираясь ТОЛЬКО на эти выдержки.',
      'Не останавливайся на пересказе фактов из заметок: если финальный ответ можно вычислить или вывести из них (например, пересчитать упомянутый в заметке возраст на сегодняшнюю дату), доведи рассуждение до конца.',
      'Начни ответ с итогового вывода, затем кратко покажи, из каких заметок и как он получен, с датами этих заметок.',
      'Если в выдержках нет ответа и вывести его нельзя, прямо скажи, что в дневнике ничего подходящего не нашлось — не выдумывай.',
      '',
      `Вопрос: ${question}`,
      '',
      'Выдержки из дневника:',
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
        max_completion_tokens: 2500,
        // 'low' (not 'minimal'): final conclusions often need a bit of
        // arithmetic, e.g. recomputing an age to today's date
        reasoning_effort: 'low',
      }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Diary QA LLM error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error('Diary QA LLM returned no answer');
    }
    return answer;
  }
}
