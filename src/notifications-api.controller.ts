import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  InternalServerErrorException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { getDiaryChatIdNumber } from './diary.constants';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

type SendNotificationBody = {
  text?: string;
};

const MAX_NOTIFICATION_TEXT_LENGTH = 4096;

@Controller('notifications-api')
export class NotificationsApiController {
  constructor(
    private readonly configService: ConfigService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  @Post('messages')
  async sendMessage(
    @Headers('x-notification-api-key') apiKey: string | undefined,
    @Body() body: SendNotificationBody,
  ) {
    this.assertApiKey(apiKey);
    const text = this.parseText(body?.text);
    const sentMessage = await this.telegramBotService.sendDirectMessage(
      getDiaryChatIdNumber(),
      text,
    );

    return {
      chatId: getDiaryChatIdNumber(),
      textLength: text.length,
      telegramMessageId: sentMessage.messageId,
      sentAt: new Date().toISOString(),
    };
  }

  private assertApiKey(receivedKey?: string): void {
    const expectedKey = this.configService.get<string>('NOTE_API_KEY');
    if (!expectedKey) {
      throw new InternalServerErrorException('NOTE_API_KEY is not configured');
    }

    if (!receivedKey || !this.isSameSecret(receivedKey, expectedKey)) {
      throw new UnauthorizedException('Invalid API key');
    }
  }

  private isSameSecret(receivedKey: string, expectedKey: string): boolean {
    const received = Buffer.from(receivedKey);
    const expected = Buffer.from(expectedKey);

    if (received.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(received, expected);
  }

  private parseText(text?: string): string {
    const parsedText = typeof text === 'string' ? text.trim() : '';
    if (!parsedText) {
      throw new BadRequestException('Text is required');
    }

    if (parsedText.length > MAX_NOTIFICATION_TEXT_LENGTH) {
      throw new BadRequestException(
        `Text must be ${MAX_NOTIFICATION_TEXT_LENGTH} characters or less`,
      );
    }

    return parsedText;
  }
}
