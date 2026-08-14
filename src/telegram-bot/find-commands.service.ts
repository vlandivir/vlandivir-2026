import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DiarySearchService } from '../services/diary-search.service';
import { DiaryQaService } from '../services/diary-qa.service';

@Injectable()
export class FindCommandsService {
  constructor(
    private readonly diarySearch: DiarySearchService,
    private readonly diaryQa: DiaryQaService,
  ) {}

  async handleFindCommand(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const messageText = this.getCommandText(ctx);
    const query = messageText?.split(' ').slice(1).join(' ').trim();
    if (!query) {
      await ctx.reply(
        'Использование: /f <запрос> — смысловой поиск по заметкам и фото.\nНапример: /f ужин с друзьями в баре',
      );
      return;
    }

    try {
      const results = await this.diarySearch.search(BigInt(chatId), query);
      if (!results.length) {
        await ctx.reply(`По запросу «${query}» ничего не нашлось`);
        return;
      }

      const lines = results.map((result, index) => {
        const date = format(result.noteDate, 'd MMMM yyyy', { locale: ru });
        const icon = result.viaImage ? ' 🖼' : '';
        return `${index + 1}. ${date}${icon}\n${result.snippet}`;
      });
      await ctx.reply(
        `🔍 «${query}»:\n\n${lines.join('\n\n')}\n\nОткрыть день: /d <дата>`,
      );
    } catch (error) {
      console.error('Error handling find command:', error);
      await ctx.reply('Произошла ошибка при поиске');
    }
  }

  async handleAskCommand(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const messageText = this.getCommandText(ctx);
    const question = messageText?.split(' ').slice(1).join(' ').trim();
    if (!question) {
      await ctx.reply(
        'Использование: /q <вопрос> — ответ по содержимому дневника.\nНапример: /q когда я последний раз был у стоматолога?',
      );
      return;
    }

    try {
      // The retrieval + LLM round trip takes a while — show typing
      await ctx.sendChatAction('typing');
      const answer = await this.diaryQa.answer(BigInt(chatId), question);
      if (!answer) {
        await ctx.reply('В дневнике не нашлось ничего подходящего к вопросу');
        return;
      }
      await ctx.reply(answer);
    } catch (error) {
      console.error('Error handling ask command:', error);
      await ctx.reply('Произошла ошибка при поиске ответа');
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
}
