import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDiaryChatIdNumber } from './diary.constants';
import { NotificationsApiController } from './notifications-api.controller';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

describe('NotificationsApiController', () => {
  let controller: NotificationsApiController;
  let configService: {
    get: jest.Mock;
  };
  let telegramBotService: {
    sendDirectMessage: jest.Mock;
  };

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('secret'),
    };
    telegramBotService = {
      sendDirectMessage: jest.fn().mockResolvedValue({ messageId: 321 }),
    };

    controller = new NotificationsApiController(
      configService as unknown as ConfigService,
      telegramBotService as unknown as TelegramBotService,
    );
  });

  it('sends a text notification to the primary Telegram chat', async () => {
    const result = await controller.sendMessage('secret', {
      text: ' hello from api ',
    });

    expect(telegramBotService.sendDirectMessage).toHaveBeenCalledWith(
      getDiaryChatIdNumber(),
      'hello from api',
    );
    expect(result).toEqual({
      chatId: getDiaryChatIdNumber(),
      textLength: 14,
      telegramMessageId: 321,
      sentAt: expect.any(String),
    });
  });

  it('rejects requests with a wrong API key', async () => {
    await expect(
      controller.sendMessage('wrong', {
        text: 'hello',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects empty text', async () => {
    await expect(
      controller.sendMessage('secret', {
        text: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(telegramBotService.sendDirectMessage).not.toHaveBeenCalled();
  });
});
