import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SerbianCommandsService {
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }
  }

  async handleSerbianCommand(ctx: Context) {
    // Проверяем, что команда вызвана из приватного чата
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(
        'Эта команда доступна только в личных сообщениях с ботом',
      );
      return;
    }

    const messageText = this.getCommandText(ctx);
    if (!messageText) return;

    const query = messageText.split(' ').slice(1).join(' ').trim();
    if (!query) {
      await ctx.reply(
        'Пожалуйста, укажите сербское слово или выражение после команды',
      );
      return;
    }

    try {
      console.log('Отправляем запрос к ChatGPT для перевода:', query);
      await ctx.reply('Получаю перевод...');

      const translation = await this.getTranslation(query);
      console.log('Получен ответ от ChatGPT:', translation);

      await ctx.reply(translation, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error handling Serbian translation:', error);
      await ctx.reply('Произошла ошибка при получении перевода');
    }
  }

  private getCommandText(ctx: Context): string | undefined {
    if ('message' in ctx && ctx.message && 'text' in ctx.message) {
      return ctx.message.text;
    }
    if ('channelPost' in ctx && ctx.channelPost && 'text' in ctx.channelPost) {
      return ctx.channelPost.text;
    }
    return undefined;
  }

  private async getTranslation(serbianText: string): Promise<string> {
    const prompt = this.createPrompt(serbianText);

    console.log('Отправляем запрос к OpenAI API');

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5',
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices: {
          message: {
            content: string;
          };
        }[];
      };
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error in getTranslation:', error);
      throw error;
    }
  }

  private createPrompt(serbianText: string): string {
    return `
            Дай мне развернутое объяснение слова или выражения: ${serbianText} на сербском языке. 
            Хочу получить структурированный ответ. 
            Весь ответ, кроме перевода, должен быть на сербском языке.
            - Значение слова на серском
            - Примеры употребления
            - Синонимы
            - Этимология
            - Возможные переносные или разговорные значения
            - Устойчивые фыражения и фразы с указанным словом
            - Перевод слова на русский язык
            Используй жирный текст и курсив из синтаксиса Markdown, для форматирования текста.
        `;
  }
}
