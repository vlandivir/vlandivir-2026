import { Controller, Post, Body } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { Update } from 'telegraf/typings/core/types/typegram';

@Controller('telegram-bot')
export class TelegramBotController {
  constructor(private readonly telegramBotService: TelegramBotService) {}

  @Post()
  async handleWebhook(@Body() update: Update) {
    console.log(
      'Тип обновления:',
      'message' in update ? 'message' : 'callback_query',
    );
    console.log('Update:', JSON.stringify(update, null, 2));

    return this.telegramBotService.handleWebhook(update);
  }
}
