import { Injectable } from '@nestjs/common';
import {
  Update,
  Message,
  CallbackQuery,
} from 'telegraf/typings/core/types/typegram';
import { Telegraf, Context } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import {
  getDiaryChatIdNumber,
  getTelegramChannelIds,
} from '../diary.constants';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma-client';
import { DateParserService } from '../services/date-parser.service';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { message, channelPost } from 'telegraf/filters';
import { DairyCommandsService } from './dairy-commands.service';
import { FindCommandsService } from './find-commands.service';
import { StorageService } from '../services/storage.service';
import { LlmService } from '../services/llm.service';
import { SerbianCommandsService } from './serbian-commands.service';
import { ForeignCommandsService } from './foreign-commands.service';
import { HistoryCommandsService } from './history-commands.service';
import { CollageCommandsService } from './collage-commands.service';
import { DebugLogService } from '../services/debug-log.service';
import { ReelsService } from '../services/reels.service';
import * as sharp from 'sharp';
import { Readable } from 'stream';

// Telegram Bot API limitation: bots cannot download files larger than ~20 MB via getFile
const MAX_TELEGRAM_FILE_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_TELEGRAM_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;
const TARGET_TELEGRAM_PHOTO_BYTES = 9 * 1024 * 1024;
const MAX_TELEGRAM_PHOTO_DIMENSION_SUM = 10000;
const BAR_PIVSKI_ZABAVNIK = {
  name: 'Pivski Zabavnik',
  city: 'Belgrade',
  latitude: 44.8031894,
  longitude: 20.4801984,
};

type TelegramUpdate =
  | Update.CallbackQueryUpdate
  | Update.MessageUpdate
  | { channel_post: Message.TextMessage };

type TelegramPhotoFile = {
  source: Buffer;
  filename: string;
};

@Injectable()
export class TelegramBotService {
  private readonly bot: Telegraf<Context>;

  // Маппинг каналов к создателям (дополнительный механизм)
  private readonly channelCreatorMapping: Map<number, number> = new Map();
  private readonly awaitingBarLocationChats: Set<number> = new Set();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dateParser: DateParserService,
    private readonly dairyCommands: DairyCommandsService,
    private readonly findCommands: FindCommandsService,
    private readonly storageService: StorageService,
    private readonly llmService: LlmService,
    private readonly serbianCommands: SerbianCommandsService,
    private readonly foreignCommands: ForeignCommandsService,
    private readonly historyCommands: HistoryCommandsService,
    private readonly collageCommands: CollageCommandsService,
    private readonly debugLogService: DebugLogService,
    private readonly reelsService: ReelsService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf<Context>(token);

    // Добавляем middleware для логирования
    this.bot.use((ctx, next) => {
      const { updateType } = ctx;
      const chatType = ctx.chat?.type;
      console.log(
        `Получено обновление типа [${updateType}] из чата типа [${chatType}]`,
      );
      this.debugLogService.info('telegram-update', 'Incoming update', {
        updateType,
        chatType,
        hasMessage: !!ctx.message,
        hasVideo: !!(ctx.message && 'video' in ctx.message),
        hasVideoNote: !!(ctx.message && 'video_note' in ctx.message),
      });
      return next();
    });

    this.setupCommands();

    const ownerChatId = getDiaryChatIdNumber();
    for (const channelId of getTelegramChannelIds()) {
      this.addChannelCreatorMapping(channelId, ownerChatId);
    }
  }

  startBot() {
    // Заменяем launch() на webhook
    const webhookUrl = this.configService.get<string>(
      'VLANDIVIR_2025_WEBHOOK_URL',
    ); // например, https://your-domain.com/telegram-bot
    if (!webhookUrl) {
      throw new Error('VLANDIVIR_2025_WEBHOOK_URL is not defined');
    }

    // Устанавливаем webhook вместо запуска long polling
    void this.bot.telegram.setWebhook(webhookUrl);
    console.log('Telegram bot webhook set to:', webhookUrl);
  }

  stopBot() {
    this.bot.stop();
  }

  async sendDirectMessage(
    chatId: number,
    text: string,
  ): Promise<{ messageId: number }> {
    const message = await this.bot.telegram.sendMessage(chatId, text);
    return { messageId: message.message_id };
  }

  // Send a diary video by public URL (web-uploaded clips, /d re-sends).
  // Falls back to a text link if Telegram rejects the file (size / fetch).
  async sendDiaryVideo(
    chatId: number,
    videoUrl: string,
    caption: string | undefined,
    noteDate?: Date,
  ): Promise<void> {
    const dateLine = noteDate
      ? `Видео из дневника · ${format(noteDate, 'd MMMM yyyy', { locale: ru })}`
      : 'Видео из дневника';
    const fullCaption = [dateLine, caption?.trim() || null]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 1024);

    try {
      await this.bot.telegram.sendVideo(chatId, videoUrl, {
        caption: fullCaption || undefined,
      });
    } catch (error) {
      this.debugLogService.warn(
        'telegram.sendDiaryVideo',
        'sendVideo failed, falling back to URL',
        {
          chatId,
          videoUrl,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      await this.bot.telegram.sendMessage(
        chatId,
        [fullCaption, videoUrl].filter(Boolean).join('\n\n'),
      );
    }
  }

  async sendApiNotePhoto(
    chatId: number,
    imageBuffer: Buffer,
    mimeType: string,
    originalName: string,
    text: string,
    imageDescription: string,
    noteDate: Date,
  ): Promise<void> {
    const photoFile = await this.prepareApiNotePhotoForTelegram(
      imageBuffer,
      originalName,
    );
    const caption = [
      `Заметка от ${format(noteDate, 'd MMMM yyyy', { locale: ru })}`,
      '',
      text,
      '',
      `Описание: ${imageDescription}`,
    ].join('\n');

    if (caption.length <= 1024) {
      if (photoFile.source.length > MAX_TELEGRAM_PHOTO_UPLOAD_BYTES) {
        await this.bot.telegram.sendDocument(chatId, photoFile, { caption });
        return;
      }

      await this.bot.telegram.sendPhoto(chatId, photoFile, { caption });
      return;
    }

    const shortCaption = [
      `Заметка от ${format(noteDate, 'd MMMM yyyy', { locale: ru })}`,
      '',
      text,
    ]
      .join('\n')
      .slice(0, 1021);

    if (photoFile.source.length > MAX_TELEGRAM_PHOTO_UPLOAD_BYTES) {
      await this.bot.telegram.sendDocument(chatId, photoFile, {
        caption: `${shortCaption}...`,
      });
    } else {
      await this.bot.telegram.sendPhoto(chatId, photoFile, {
        caption: `${shortCaption}...`,
      });
    }
    await this.bot.telegram.sendMessage(
      chatId,
      `Описание: ${imageDescription}`,
    );
  }

  private async prepareApiNotePhotoForTelegram(
    imageBuffer: Buffer,
    originalName: string,
  ): Promise<TelegramPhotoFile> {
    const fallbackFile = {
      source: imageBuffer,
      filename: originalName || 'note-image.jpg',
    };

    try {
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const needsResize =
        width + height > MAX_TELEGRAM_PHOTO_DIMENSION_SUM ||
        imageBuffer.length > TARGET_TELEGRAM_PHOTO_BYTES;

      if (!needsResize) {
        this.debugLogService.info(
          'telegram.apiNotePhoto',
          'Using original image for Telegram',
          {
            imageBytes: imageBuffer.length,
            width,
            height,
          },
        );
        return fallbackFile;
      }

      const maxDimensionCandidates = [4096, 3600, 3200, 2560, 2048];
      const qualityCandidates = [92, 88, 84, 80, 76, 72, 68];

      let smallestCandidate: Buffer | undefined;
      let smallestMeta: Record<string, unknown> | undefined;

      for (const maxDimension of maxDimensionCandidates) {
        for (const quality of qualityCandidates) {
          const candidate = await sharp(imageBuffer)
            .rotate()
            .resize({
              width: maxDimension,
              height: maxDimension,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .flatten({ background: '#ffffff' })
            .jpeg({
              quality,
              mozjpeg: true,
              chromaSubsampling: '4:4:4',
            })
            .toBuffer();

          const meta = {
            originalBytes: imageBuffer.length,
            outputBytes: candidate.length,
            originalWidth: width,
            originalHeight: height,
            maxDimension,
            quality,
          };

          if (
            !smallestCandidate ||
            candidate.length < smallestCandidate.length
          ) {
            smallestCandidate = candidate;
            smallestMeta = meta;
          }

          if (candidate.length <= TARGET_TELEGRAM_PHOTO_BYTES) {
            this.debugLogService.info(
              'telegram.apiNotePhoto',
              'Compressed image for Telegram',
              meta,
            );
            return {
              source: candidate,
              filename: this.toJpegFilename(originalName),
            };
          }
        }
      }

      this.debugLogService.warn(
        'telegram.apiNotePhoto',
        'Compressed image is still above Telegram photo target',
        smallestMeta,
      );

      if (smallestCandidate) {
        return {
          source: smallestCandidate,
          filename: this.toJpegFilename(originalName),
        };
      }
    } catch (error) {
      this.debugLogService.warn(
        'telegram.apiNotePhoto',
        'Failed to compress image for Telegram, falling back to original',
        {
          imageBytes: imageBuffer.length,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
    }

    return fallbackFile;
  }

  private toJpegFilename(originalName: string): string {
    const fallback = 'note-image.jpg';
    if (!originalName) return fallback;

    const baseName = originalName.replace(/\.[^.]+$/, '');
    return `${baseName || 'note-image'}.jpg`;
  }

  private setupCommands() {
    // Регистрируем команды для личных чатов и групп
    this.bot.command(['dairy', 'd'], (ctx) => {
      console.log('Получена команда /dairy /d:', ctx.message?.text);
      return this.dairyCommands.handleDairyCommand(ctx);
    });

    this.bot.command(['find', 'f'], (ctx) => {
      console.log('Получена команда /find /f:', ctx.message?.text);
      return this.findCommands.handleFindCommand(ctx);
    });

    this.bot.command(['q', 'ask'], (ctx) => {
      console.log('Получена команда /q /ask:', ctx.message?.text);
      return this.findCommands.handleAskCommand(ctx);
    });

    // Регистрируем те же команды для каналов
    this.bot.on(channelPost('text'), async (ctx) => {
      console.log('Получено сообщение из канала:', {
        text: ctx.channelPost.text,
        from: ctx.channelPost.from,
        chat: ctx.chat,
      });

      if (
        ctx.channelPost.text.startsWith('/d') ||
        ctx.channelPost.text.startsWith('/dairy')
      ) {
        console.log('Обработка команды /dairy /d из канала');
        await this.dairyCommands.handleDairyCommand(ctx);
        return;
      }
      const update = {
        channel_post: ctx.channelPost,
      } as TelegramUpdate;
      await this.handleIncomingMessage(ctx.chat.id, update, true);
    });

    // Add the new Serbian translation command
    this.bot.command(['s'], (ctx) => {
      console.log('Получена команда /s:', ctx.message?.text);
      return this.serbianCommands.handleSerbianCommand(ctx);
    });

    // Add the foreign translation command
    this.bot.command(['p', 'phrase'], (ctx) => {
      console.log('Получена команда /p /phrase:', ctx.message?.text);
      return this.foreignCommands.handleForeignCommand(ctx);
    });

    // Add the new history command
    this.bot.command(['history'], (ctx) => {
      console.log('Получена команда /history:', ctx.message?.text);
      return this.historyCommands.handleHistoryCommand(ctx);
    });

    // Mini app command
    this.bot.command(['a'], async (ctx) => {
      try {
        const webhookUrl = this.configService.get<string>(
          'VLANDIVIR_2025_WEBHOOK_URL',
        );
        if (!webhookUrl) {
          await ctx.reply('Mini app URL is not configured');
          return;
        }
        const baseUrl = new URL(webhookUrl).origin;
        const appUrl = `${baseUrl}/mini-app`;
        await ctx.reply('Откройте GTD:', {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Открыть GTD',
                  web_app: { url: appUrl },
                },
              ],
            ],
          },
        });
      } catch (error) {
        console.error('Error sending mini app button', error);
        await ctx.reply('Не удалось открыть мини‑приложение');
      }
    });

    // Save video by direct URL (workaround for >20MB Telegram getFile limit)
    this.bot.command(['v', 'video'], async (ctx) => {
      try {
        const text = ctx.message?.text || '';
        const args = text.replace(/^\/(v|video)\s*/i, '').trim();
        if (!args) {
          await ctx.reply('Usage: /v <direct video URL> [optional caption]');
          return;
        }
        const parts = args.split(/\s+/);
        const urlCandidate = parts[0];
        let videoUrlInput: URL;
        try {
          videoUrlInput = new URL(urlCandidate);
        } catch {
          await ctx.reply(
            'Invalid URL. Usage: /v <direct video URL> [caption]',
          );
          return;
        }
        const caption = parts.slice(1).join(' ');
        await this.handleVideoByUrl(ctx, videoUrlInput.toString(), caption);
      } catch (e) {
        console.error('Error in /v command', e);
        await ctx.reply('Ошибка при сохранении видео по ссылке');
      }
    });

    // Export in-memory debug logs to storage as text file
    this.bot.command(['debuglog', 'dl'], async (ctx) => {
      try {
        const chatId = ctx.chat?.id;
        if (!chatId) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const key = `chats/${chatId}/debug/debug-log-${timestamp}.txt`;
        const text = this.debugLogService.toText();
        const body = Buffer.from(
          text || 'No debug logs collected in current process.',
          'utf-8',
        );
        const url = await this.storageService.uploadFileWithKey(
          body,
          'text/plain; charset=utf-8',
          key,
        );
        await ctx.reply(
          `Лог сохранен в storage (${this.debugLogService.count()} записей): ${url}`,
        );
      } catch (error) {
        console.error('Error exporting debug logs', error);
        await ctx.reply('Не удалось выгрузить debug-лог');
      }
    });

    // Help command
    this.bot.command(['help'], (ctx) => {
      console.log('Получена команда /help');
      return ctx.reply(this.getHelpMessage());
    });

    // Bar command: ask user for location, then show user/bar points and distance
    this.bot.command(['bar'], async (ctx) => {
      if (ctx.chat?.type !== 'private') {
        await ctx.reply(
          'Команда /bar доступна только в личных сообщениях с ботом',
        );
        return;
      }

      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('Unable to determine chat.');
        return;
      }

      this.awaitingBarLocationChats.add(chatId);
      const locationButton = {
        text: '📍 Поделиться геолокацией',
        request_location: true,
      };

      await ctx.reply(
        `Отправьте вашу геолокацию, и я покажу расстояние до бара ${BAR_PIVSKI_ZABAVNIK.name} (${BAR_PIVSKI_ZABAVNIK.city}).`,
        {
          reply_markup: {
            keyboard: [[locationButton]],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        },
      );
    });

    // Collage command - starts interactive collage creation
    this.bot.command(['collage', 'c'], (ctx) => {
      console.log('Получена команда /collage /c:', ctx.message?.text);
      return this.collageCommands.startConversation(ctx);
    });

    // Обработчик для текстовых сообщений в личных чатах и группах
    this.bot.on(message('text'), async (ctx) => {
      console.log('Получено текстовое сообщение:', ctx.message.text);

      if (ctx.message.text.startsWith('/')) return;

      // In private chats an Instagram reel/post link is added to the reels
      // notebook instead of being saved as a plain diary note.
      if (
        ctx.chat.type === 'private' &&
        this.reelsService.extractShortcode(ctx.message.text)
      ) {
        await this.handleReelLink(ctx.chat.id, ctx.message.text);
        return;
      }

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      await this.handleIncomingMessage(ctx.chat.id, ctx.update, isGroup);
    });

    // Обработчик для фото в личных чатах и группах
    this.bot.on(message('photo'), async (ctx) => {
      console.log('Получено фото из чата/группы');

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      await this.handleIncomingPhoto(ctx, isGroup);
    });

    // Обработчик фото из каналов
    this.bot.on(channelPost('photo'), async (ctx) => {
      console.log('Получено фото из канала');

      if (!ctx.channelPost) return;

      const photoContext = {
        ...ctx,
        message: ctx.channelPost,
        chat: ctx.chat,
        updateType: 'message',
        me: ctx.botInfo,
        tg: ctx.telegram,
        editedMessage: undefined,
        state: {},
      } as unknown as Context;

      await this.handleIncomingPhoto(photoContext, true);
    });

    // Обработчик для видео в личных чатах и группах
    this.bot.on(message('video'), async (ctx) => {
      console.log('Получено видео из чата/группы');

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      await this.handleIncomingVideo(ctx, isGroup);
    });

    // Handler for Telegram video notes ("circles")
    this.bot.on(message('video_note'), async (ctx) => {
      console.log('Получен video_note (кружок) из чата/группы');
      this.debugLogService.info(
        'video-note-handler',
        'Received message(video_note)',
        { chatId: ctx.chat?.id },
      );
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      await this.handleIncomingVideo(ctx, isGroup);
    });

    // Handle location shares for /bar flow
    this.bot.on(message('location'), async (ctx) => {
      const chatId = ctx.chat?.id;
      if (!chatId || !this.awaitingBarLocationChats.has(chatId)) {
        return;
      }

      this.awaitingBarLocationChats.delete(chatId);
      const location = ctx.message.location;
      const distanceKm = this.calculateDistanceKm(
        location.latitude,
        location.longitude,
        BAR_PIVSKI_ZABAVNIK.latitude,
        BAR_PIVSKI_ZABAVNIK.longitude,
      );

      await ctx.reply(
        `Спасибо! Вы на карте и ${BAR_PIVSKI_ZABAVNIK.name} (${BAR_PIVSKI_ZABAVNIK.city}) отмечены ниже.`,
        {
          reply_markup: { remove_keyboard: true },
        },
      );

      const staticMapUrls = this.buildTwoPinsStaticMapUrls(
        location.latitude,
        location.longitude,
        BAR_PIVSKI_ZABAVNIK.latitude,
        BAR_PIVSKI_ZABAVNIK.longitude,
        distanceKm,
      );
      const directionsLink =
        `https://www.google.com/maps/dir/?api=1` +
        `&origin=${location.latitude},${location.longitude}` +
        `&destination=${BAR_PIVSKI_ZABAVNIK.latitude},${BAR_PIVSKI_ZABAVNIK.longitude}`;
      try {
        const staticMapBuffer =
          await this.downloadFirstAvailableBinary(staticMapUrls);
        await ctx.replyWithPhoto(
          { source: staticMapBuffer, filename: 'bar-map.png' },
          {
            caption:
              `Карта: вы и ${BAR_PIVSKI_ZABAVNIK.name}\n` +
              `Расстояние до бара: ${distanceKm.toFixed(2)} км`,
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Открыть маршрут', url: directionsLink }],
              ],
            },
          },
        );
      } catch (error) {
        console.error('Failed to render/send static map', error);
        await ctx.reply(
          `Не удалось загрузить карту с двумя точками.\n` +
            `Расстояние до бара: ${distanceKm.toFixed(2)} км`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Открыть маршрут', url: directionsLink }],
              ],
            },
          },
        );
      }
    });

    // Обработчик видео из каналов
    this.bot.on(channelPost('video'), async (ctx) => {
      console.log('Получено видео из канала');

      if (!ctx.channelPost) return;

      const videoContext = {
        ...ctx,
        message: ctx.channelPost,
        chat: ctx.chat,
        updateType: 'message',
        me: ctx.botInfo,
        tg: ctx.telegram,
        editedMessage: undefined,
        state: {},
      } as unknown as Context;

      await this.handleIncomingVideo(videoContext, true);
    });

    // Channel handler for Telegram video notes
    this.bot.on(channelPost('video_note'), async (ctx) => {
      console.log('Получен video_note (кружок) из канала');
      if (!ctx.channelPost) return;
      this.debugLogService.info(
        'video-note-handler',
        'Received channelPost(video_note)',
        { chatId: ctx.chat?.id },
      );
      const videoNoteContext = {
        ...ctx,
        message: ctx.channelPost,
        chat: ctx.chat,
        updateType: 'message',
        me: ctx.botInfo,
        tg: ctx.telegram,
        editedMessage: undefined,
        state: {},
      } as unknown as Context;
      await this.handleIncomingVideo(videoNoteContext, true);
    });

    // Handle inline buttons
    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as CallbackQuery.DataQuery | undefined)
        ?.data;
      if (data === 'collage_cancel') {
        await this.collageCommands.cancel(ctx);
      } else if (data === 'collage_generate') {
        await this.collageCommands.generate(ctx);
      } else if (data === 'collage_generate_special') {
        await this.collageCommands.generateSpecial(ctx);
      } else if (data === 'collage_generate_special2') {
        await this.collageCommands.askCircleSize(ctx);
      } else if (
        data === 'circle_size_50' ||
        data === 'circle_size_60' ||
        data === 'circle_size_70' ||
        data === 'circle_size_80' ||
        data === 'circle_size_90'
      ) {
        const percent = parseInt(data.replace('circle_size_', ''), 10);
        await this.collageCommands.generateSpecial2(ctx, percent);
      }
    });
  }

  async handleIncomingMessage(
    chatId: number,
    update: TelegramUpdate,
    silent = false,
  ) {
    try {
      const messageText = this.extractMessageText(update);
      const { date: noteDate, cleanContent } =
        this.dateParser.extractDateFromFirstLine(messageText);

      // Получаем ID отправителя или создателя канала
      let fromUserId: number | undefined = this.extractSenderId(update);

      // Если это канал и нет ID отправителя, получаем создателя канала
      if ('channel_post' in update && !fromUserId) {
        console.log(
          'DEBUG: No fromUserId found, trying to get channel creator',
        );
        const creatorId = await this.getChannelCreatorId(chatId);
        if (creatorId) {
          fromUserId = creatorId;
          console.log('Найден создатель канала:', fromUserId);
        } else {
          console.log('DEBUG: Could not find channel creator');
        }
      }

      // Сохраняем сообщение в чат/группу/канал
      const savedNote = await this.prisma.note.create({
        data: {
          content: cleanContent,
          rawMessage: JSON.parse(
            JSON.stringify(update),
          ) as unknown as Prisma.InputJsonValue,
          chatId,
          noteDate: noteDate || new Date(),
        },
      });

      if (!silent) {
        // Формируем и отправляем ответ бота только для личных чатов
        const botResponse = `Сообщение сохранено${noteDate ? ` с датой ${format(noteDate, 'd MMMM yyyy', { locale: ru })}` : ''}`;
        await this.bot.telegram.sendMessage(chatId, botResponse);

        await this.prisma.botResponse.create({
          data: {
            content: botResponse,
            noteId: savedNote.id,
            chatId,
          },
        });
      }

      // Если это канал и есть ID создателя, сохраняем копию в его личный чат
      if ('channel_post' in update && fromUserId && chatId !== fromUserId) {
        console.log('Сохраняем копию создателю канала:', fromUserId);
        await this.prisma.note.create({
          data: {
            content: cleanContent,
            rawMessage: JSON.parse(
              JSON.stringify(update),
            ) as unknown as Prisma.InputJsonValue,
            chatId: fromUserId,
            noteDate: noteDate || new Date(),
          },
        });
      } else if ('channel_post' in update) {
        console.log(
          'DEBUG: Channel post detected but not copying. fromUserId:',
          fromUserId,
          'chatId:',
          chatId,
        );
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  // Save an Instagram reel/post link into the shared reels notebook
  // (the `Reel` archive behind /reels). Mirrors POST /reels-api/reels:
  // dedup by shortcode, retry failed reels, otherwise create a pending
  // record and kick off background download/analysis.
  public async handleReelLink(chatId: number, text: string): Promise<boolean> {
    const shortcode = this.reelsService.extractShortcode(text);
    if (!shortcode) return false;

    try {
      const instagramUrl =
        this.extractInstagramUrl(text) ||
        `https://www.instagram.com/reel/${shortcode}/`;

      const existing = await this.prisma.reel.findUnique({
        where: { shortcode },
      });

      if (existing) {
        if (existing.status === 'error') {
          await this.prisma.reel.update({
            where: { id: existing.id },
            data: { status: 'pending', error: null },
          });
          this.reelsService.processInBackground(existing.id, (id) =>
            this.notifyReelProcessed(chatId, id),
          );
          await this.bot.telegram.sendMessage(
            chatId,
            'Перезапускаю обработку этого рилса в записной книжке 🎬',
          );
        } else {
          if (existing.isOwn && existing.status === 'ready') {
            await this.reelsService.ensureOwnReelInDiary(existing.id);
          }
          const url = this.buildReelPageUrl(existing.id);
          await this.bot.telegram.sendMessage(
            chatId,
            `Этот рилс уже есть в записной книжке 🎬${url ? `\n${url}` : ''}`,
          );
        }
        return true;
      }

      const reel = await this.prisma.reel.create({
        data: { instagramUrl, shortcode, source: 'notebook' },
      });
      this.reelsService.processInBackground(reel.id, (id) =>
        this.notifyReelProcessed(chatId, id),
      );
      await this.bot.telegram.sendMessage(
        chatId,
        'Ссылка на рилс сохранена в записную книжку, обрабатываю 🎬',
      );
      return true;
    } catch (error) {
      console.error('Error saving reel link:', error);
      this.debugLogService.warn('reel-link', 'Failed to save reel link', {
        chatId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      await this.bot.telegram.sendMessage(
        chatId,
        'Не удалось сохранить рилс в записную книжку',
      );
      return true;
    }
  }

  private extractInstagramUrl(text: string): string | null {
    const match = /https?:\/\/[^\s]*instagram\.com\/[^\s]+/i.exec(text);
    return match ? match[0] : null;
  }

  // Called once background processing has settled: tell the user the result
  // with a share link to the reel page plus a bit of the extracted metadata.
  public async notifyReelProcessed(
    chatId: number,
    reelId: number,
  ): Promise<void> {
    try {
      const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
      this.debugLogService.info('reel-link', 'Reel processing settled', {
        chatId,
        reelId,
        found: !!reel,
        status: reel?.status,
      });
      if (!reel) return;

      if (reel.status === 'error') {
        await this.bot.telegram.sendMessage(
          chatId,
          `Не удалось обработать рилс${reel.error ? `: ${reel.error}` : ''} 😕`,
        );
        return;
      }

      await this.bot.telegram.sendMessage(
        chatId,
        this.buildReelReadyMessage(reel),
      );
    } catch (error) {
      console.error('Error notifying about processed reel:', error);
      this.debugLogService.warn(
        'reel-link',
        'Failed to notify processed reel',
        {
          chatId,
          reelId,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  private buildReelReadyMessage(reel: {
    id: number;
    shortcode: string;
    title: string | null;
    author: string | null;
    duration: number | null;
    tags: string[];
  }): string {
    const lines: string[] = [`🎬 ${reel.title || reel.shortcode}`];

    const facts: string[] = [];
    if (reel.author) facts.push(`Автор: ${reel.author}`);
    if (typeof reel.duration === 'number' && reel.duration > 0) {
      facts.push(`Длительность: ${this.formatDuration(reel.duration)}`);
    }
    if (facts.length) lines.push(facts.join(' · '));

    if (reel.tags?.length) {
      lines.push(
        reel.tags.map((tag) => `#${tag.replace(/\s+/g, '_')}`).join(' '),
      );
    }

    const url = this.buildReelPageUrl(reel.id);
    if (url) lines.push(url);

    return lines.join('\n');
  }

  private formatDuration(seconds: number): string {
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  // Link to a single reel in the notebook (behind Google sign-in):
  // <origin>/reels/<id>
  private buildReelPageUrl(reelId: number): string | null {
    const webhookUrl = this.configService.get<string>(
      'VLANDIVIR_2025_WEBHOOK_URL',
    );
    if (!webhookUrl) return null;
    try {
      const baseUrl = new URL(webhookUrl).origin;
      return `${baseUrl}/reels/${reelId}`;
    } catch {
      return null;
    }
  }

  private extractMessageText(update: TelegramUpdate): string {
    if ('message' in update && update.message && 'text' in update.message) {
      return update.message.text || '';
    }
    if (
      'callback_query' in update &&
      update.callback_query.message &&
      'text' in update.callback_query.message
    ) {
      return update.callback_query.message.text || '';
    }
    if (
      'channel_post' in update &&
      update.channel_post &&
      'text' in update.channel_post
    ) {
      return update.channel_post.text || '';
    }
    return '';
  }

  public async handleIncomingPhoto(ctx: Context, silent = false) {
    try {
      if (!ctx.message) return;

      const photos = 'photo' in ctx.message ? ctx.message.photo : null;
      const caption = 'caption' in ctx.message ? ctx.message.caption : '';

      if (!photos || photos.length === 0 || !ctx.chat) return;

      // Check if interactive collage session is active
      if (this.collageCommands.isActive(ctx.chat.id)) {
        await this.collageCommands.addImage(ctx);
        return;
      }

      // Check if this is a collage command via caption
      if (
        caption &&
        (caption.toLowerCase().includes('/collage') ||
          caption.toLowerCase().includes('/c'))
      ) {
        console.log('Collage command detected in photo caption');
        await this.collageCommands.handleCollageCommand(ctx);
        return; // Exit early to prevent saving individual images
      }

      // Process all photos for database saving (original behavior)
      const photo = photos[photos.length - 1]; // Use the highest quality photo
      const file = await ctx.telegram.getFile(photo.file_id);
      const photoBuffer = await this.downloadFile(file.file_path!);
      const photoUrl = await this.storageService.uploadFile(
        photoBuffer,
        'image/jpeg',
        ctx.chat.id,
      );

      // Get image description from LLM
      const imageDescription = await this.llmService.describeImage(
        photoBuffer,
        caption,
      );

      const { date: noteDate, cleanContent } =
        this.dateParser.extractDateFromFirstLine(caption || '');

      // Получаем ID отправителя или создателя канала
      let fromUserId: number | undefined = ctx.message.from?.id;

      // Если это канал и нет ID отправителя, получаем создателя канала
      if (ctx.chat.type === 'channel' && !fromUserId) {
        const creatorId = await this.getChannelCreatorId(ctx.chat.id);
        if (creatorId) {
          fromUserId = creatorId;
          console.log('Найден создатель канала:', fromUserId);
        } else {
          console.log('DEBUG: Could not find channel creator for photo');
        }
      }

      // Сохраняем фото в чат/группу/канал
      const savedNote = await this.prisma.note.create({
        data: {
          content: cleanContent || '',
          rawMessage: JSON.parse(
            JSON.stringify(ctx.message),
          ) as unknown as Prisma.InputJsonValue,
          chatId: ctx.chat.id,
          noteDate: noteDate || new Date(),
          images: {
            create: {
              url: photoUrl,
              description: imageDescription,
            },
          },
        },
        include: {
          images: true,
        },
      });

      if (!silent) {
        const botResponse = `Фотография сохранена${
          noteDate
            ? ` с датой ${format(noteDate, 'd MMMM yyyy', { locale: ru })}`
            : ''
        }\n\nОписание: ${imageDescription}`;
        await ctx.reply(botResponse);

        await this.prisma.botResponse.create({
          data: {
            content: botResponse,
            noteId: savedNote.id,
            chatId: ctx.chat.id,
          },
        });
      }

      // Если это канал и есть ID создателя, сохраняем копию фото в его личный чат
      if (
        ctx.chat.type === 'channel' &&
        fromUserId &&
        ctx.chat.id !== fromUserId
      ) {
        console.log('Сохраняем копию фото создателю канала:', fromUserId);
        await this.prisma.note.create({
          data: {
            content: cleanContent || '',
            rawMessage: JSON.parse(
              JSON.stringify(ctx.message),
            ) as unknown as Prisma.InputJsonValue,
            chatId: fromUserId,
            noteDate: noteDate || new Date(),
            images: {
              create: {
                url: photoUrl,
                description: imageDescription,
              },
            },
          },
        });
      }
    } catch (error) {
      console.error('Error processing photo:', error);
      if (!silent) {
        await ctx.reply('Произошла ошибка при сохранении фотографии');
      }
    }
  }

  public async handleIncomingVideo(ctx: Context, silent = false) {
    try {
      if (!ctx.message) return;

      const video = 'video' in ctx.message ? ctx.message.video : null;
      const videoNote =
        'video_note' in ctx.message ? ctx.message.video_note : null;
      const caption = 'caption' in ctx.message ? ctx.message.caption : '';
      const media = video ?? videoNote;
      const mediaType = video ? 'video' : videoNote ? 'video_note' : 'none';
      this.debugLogService.info('video-ingest', 'Entered handleIncomingVideo', {
        chatId: ctx.chat?.id,
        mediaType,
        hasVideo: !!video,
        hasVideoNote: !!videoNote,
        captionLength: caption?.length || 0,
      });

      if (!media || !ctx.chat) return;

      // Pre-check size to avoid Telegram "file is too big" errors on getFile
      const fileSize =
        typeof media.file_size === 'number' ? media.file_size : 0;
      if (fileSize > MAX_TELEGRAM_FILE_DOWNLOAD_BYTES) {
        console.warn(
          `Video too large to download via Telegram getFile: ${fileSize} bytes > ${MAX_TELEGRAM_FILE_DOWNLOAD_BYTES}`,
        );

        const { date: tooBigNoteDate, cleanContent: tooBigCleanContent } =
          this.dateParser.extractDateFromFirstLine(caption || '');

        // Save only the text/caption and raw message without video
        const savedNoteTooBig = await this.prisma.note.create({
          data: {
            content: tooBigCleanContent || '',
            rawMessage: JSON.parse(
              JSON.stringify(ctx.message),
            ) as unknown as Prisma.InputJsonValue,
            chatId: ctx.chat.id,
            noteDate: tooBigNoteDate || new Date(),
          },
        });

        if (!silent) {
          const mb = (fileSize / (1024 * 1024)).toFixed(1);
          await ctx.reply(
            `Видео не сохранено: файл слишком большой для скачивания ботом (${mb} MB). Ограничение Telegram ≈ 20 MB. Сократите/сожмите видео или пришлите ссылку. Описание заметки сохранено${
              tooBigNoteDate
                ? ` с датой ${format(tooBigNoteDate, 'd MMMM yyyy', { locale: ru })}`
                : ''
            }`,
          );

          await this.prisma.botResponse.create({
            data: {
              content: `Видео не сохранено: превышен лимит Telegram на скачивание файлов ботом.`,
              noteId: savedNoteTooBig.id,
              chatId: ctx.chat.id,
            },
          });
        }

        // If this is a channel post, also save a copy for the creator (text only)
        let channelCreatorId: number | undefined = ctx.message.from?.id;
        if (ctx.chat.type === 'channel' && !channelCreatorId) {
          channelCreatorId = await this.getChannelCreatorId(ctx.chat.id);
        }
        if (
          ctx.chat.type === 'channel' &&
          channelCreatorId &&
          ctx.chat.id !== channelCreatorId
        ) {
          await this.prisma.note.create({
            data: {
              content: savedNoteTooBig.content,
              rawMessage: JSON.parse(
                JSON.stringify(ctx.message),
              ) as unknown as Prisma.InputJsonValue,
              chatId: channelCreatorId,
              noteDate: savedNoteTooBig.noteDate,
            },
          });
        }

        return; // Stop further processing for oversized videos
      }

      // Normal flow for acceptable sizes
      const file = await ctx.telegram.getFile(media.file_id);
      const videoBuffer = await this.downloadFile(file.file_path!);
      const videoUrl = await this.storageService.uploadVideo(
        videoBuffer,
        video?.mime_type || 'video/mp4',
        ctx.chat.id,
      );
      this.debugLogService.info('video-ingest', 'Uploaded media to storage', {
        chatId: ctx.chat.id,
        mediaType,
        fileSize,
        videoUrl,
      });

      const { date: noteDate, cleanContent } =
        this.dateParser.extractDateFromFirstLine(caption || '');

      let fromUserId: number | undefined = ctx.message.from?.id;

      if (ctx.chat.type === 'channel' && !fromUserId) {
        const creatorId = await this.getChannelCreatorId(ctx.chat.id);
        if (creatorId) {
          fromUserId = creatorId;
          console.log('Найден создатель канала:', fromUserId);
        } else {
          console.log('DEBUG: Could not find channel creator for video');
        }
      }

      const savedNote = await this.prisma.note.create({
        data: {
          content: cleanContent || '',
          rawMessage: JSON.parse(
            JSON.stringify(ctx.message),
          ) as unknown as Prisma.InputJsonValue,
          chatId: ctx.chat.id,
          noteDate: noteDate || new Date(),
          videos: {
            create: {
              url: videoUrl,
              description: caption || null,
            },
          },
        },
        include: {
          videos: true,
        },
      });
      this.debugLogService.info('video-ingest', 'Saved note with video', {
        chatId: ctx.chat.id,
        noteId: savedNote.id,
        mediaType,
        videosCount: savedNote.videos.length,
      });

      if (!silent) {
        const botResponse = `Видео сохранено${
          noteDate
            ? ` с датой ${format(noteDate, 'd MMMM yyyy', { locale: ru })}`
            : ''
        }`;
        await ctx.reply(botResponse);

        await this.prisma.botResponse.create({
          data: {
            content: botResponse,
            noteId: savedNote.id,
            chatId: ctx.chat.id,
          },
        });
      }

      if (
        ctx.chat.type === 'channel' &&
        fromUserId &&
        ctx.chat.id !== fromUserId
      ) {
        console.log('Сохраняем копию видео создателю канала:', fromUserId);
        await this.prisma.note.create({
          data: {
            content: cleanContent || '',
            rawMessage: JSON.parse(
              JSON.stringify(ctx.message),
            ) as unknown as Prisma.InputJsonValue,
            chatId: fromUserId,
            noteDate: noteDate || new Date(),
            videos: {
              create: {
                url: videoUrl,
                description: caption || null,
              },
            },
          },
        });
      }
    } catch (error) {
      // Gracefully handle Telegram "file is too big" error if it occurs despite checks
      const maybeTelegramError = error as unknown as {
        response?: { description?: string };
      };
      if (
        maybeTelegramError?.response?.description &&
        maybeTelegramError.response.description
          .toLowerCase()
          .includes('file is too big')
      ) {
        if (!silent) {
          await ctx.reply(
            'Видео не сохранено: файл слишком большой для скачивания ботом (лимит Telegram ≈ 20 MB). Сократите/сожмите видео или пришлите прямую ссылку и используйте команду /v <url> [описание] для сохранения.',
          );
        }
        return;
      }
      console.error('Error processing video:', error);
      if (!silent) {
        await ctx.reply('Произошла ошибка при сохранении видео');
      }
    }
  }

  private async handleVideoByUrl(
    ctx: Context,
    url: string,
    caption: string,
  ): Promise<void> {
    if (!ctx.chat) return;
    const { stream, mimeType } = await this.createStreamFromUrl(url);

    const uploadedUrl = await this.storageService.uploadVideoStream(
      stream,
      mimeType,
      ctx.chat.id,
    );

    const { date: noteDate, cleanContent } =
      this.dateParser.extractDateFromFirstLine(caption || '');

    const savedNote = await this.prisma.note.create({
      data: {
        content: cleanContent || '',
        rawMessage: JSON.parse(
          JSON.stringify({ url, caption }),
        ) as unknown as Prisma.InputJsonValue,
        chatId: ctx.chat.id,
        noteDate: noteDate || new Date(),
        videos: {
          create: {
            url: uploadedUrl,
            description: caption || null,
          },
        },
      },
      include: { videos: true },
    });

    await ctx.reply(
      `Видео сохранено по ссылке${
        noteDate
          ? ` с датой ${format(noteDate, 'd MMMM yyyy', { locale: ru })}`
          : ''
      }`,
    );

    await this.prisma.botResponse.create({
      data: {
        content: 'Видео сохранено по ссылке',
        noteId: savedNote.id,
        chatId: ctx.chat.id,
      },
    });

    // If post came from a channel, save a copy to creator as well (text + video)
    let fromUserId: number | undefined =
      ctx.message && 'from' in ctx.message ? ctx.message.from?.id : undefined;
    if (ctx.chat.type === 'channel' && !fromUserId) {
      fromUserId = await this.getChannelCreatorId(ctx.chat.id);
    }
    if (
      ctx.chat.type === 'channel' &&
      fromUserId &&
      ctx.chat.id !== fromUserId
    ) {
      await this.prisma.note.create({
        data: {
          content: cleanContent || '',
          rawMessage: JSON.parse(
            JSON.stringify({ url, caption }),
          ) as unknown as Prisma.InputJsonValue,
          chatId: fromUserId,
          noteDate: noteDate || new Date(),
          videos: {
            create: {
              url: uploadedUrl,
              description: caption || null,
            },
          },
        },
      });
    }
  }

  private async createStreamFromUrl(
    url: string,
  ): Promise<{ stream: Readable; mimeType: string }> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to fetch video: ${response.status} ${response.statusText}`,
      );
    }
    const contentType = response.headers.get('content-type') || 'video/mp4';

    // Convert Web ReadableStream to Node.js Readable without using any type assertions
    async function* chunkGenerator(stream: ReadableStream<Uint8Array>) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            yield Buffer.from(value);
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // response.body is a Web ReadableStream<Uint8Array> in Node 18+
    const webStream = response.body as unknown as ReadableStream<Uint8Array>;
    const nodeReadable = Readable.from(chunkGenerator(webStream));
    return { stream: nodeReadable, mimeType: contentType };
  }

  private async downloadFile(filePath: string): Promise<Buffer> {
    const response = await fetch(
      `https://api.telegram.org/file/bot${this.configService.get('TELEGRAM_BOT_TOKEN')}/${filePath}`,
    );
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async downloadBinary(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download binary: ${response.status} ${response.statusText}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async downloadFirstAvailableBinary(urls: string[]): Promise<Buffer> {
    let lastError: unknown;
    for (const url of urls) {
      try {
        return await this.downloadBinary(url);
      } catch (error) {
        lastError = error;
        console.warn('Static map provider failed:', url, error);
      }
    }
    throw lastError ?? new Error('No static map providers available');
  }

  private extractSenderId(update: TelegramUpdate): number | undefined {
    if ('message' in update && update.message?.from) {
      return update.message.from.id;
    }
    if ('callback_query' in update && update.callback_query?.from) {
      return update.callback_query.from.id;
    }
    if ('channel_post' in update && update.channel_post?.from) {
      console.log(
        'DEBUG: Found from field in channel_post:',
        update.channel_post.from,
      );
      return update.channel_post.from.id;
    }
    if ('channel_post' in update) {
      console.log(
        'DEBUG: Channel post has no from field:',
        update.channel_post,
      );
    }
    return undefined;
  }

  private async getChannelCreatorId(
    chatId: number,
  ): Promise<number | undefined> {
    // Сначала проверяем маппинг
    if (this.channelCreatorMapping.has(chatId)) {
      const creatorId = this.channelCreatorMapping.get(chatId);
      console.log('DEBUG: Found creator in mapping:', creatorId);
      return creatorId;
    }

    // Если нет в маппинге, пытаемся получить через API
    try {
      const admins = await this.bot.telegram.getChatAdministrators(chatId);
      const creator = admins.find((admin) => admin.status === 'creator');
      if (creator) {
        const creatorId = creator.user.id;
        // Сохраняем в маппинг для будущего использования
        this.channelCreatorMapping.set(chatId, creatorId);
        console.log(
          'DEBUG: Found creator via API and saved to mapping:',
          creatorId,
        );
        return creatorId;
      }
    } catch (error) {
      console.error(
        'Ошибка при получении информации о создателе канала:',
        error,
      );
    }

    return undefined;
  }

  private getHelpMessage(): string {
    const commands = [
      { name: '/d or /dairy', description: 'Dairy Notes' },
      { name: '/f or /find', description: 'Semantic search over notes' },
      { name: '/q or /ask', description: 'Answer a question from the diary' },
      { name: '/history', description: 'Chat History' },
      { name: '/s', description: 'Serbian Translation' },
      { name: '/p or /phrase', description: 'Translate between RU/EN/SR' },
      { name: '/a', description: 'Open GTD Mini App' },
      { name: '/bar', description: 'Distance to Pivski Zabavnik' },
      { name: '/c or /collage', description: 'Create image collage' },
      { name: '/dl or /debuglog', description: 'Export in-memory debug log' },
      { name: '/help', description: 'Show this help message' },
    ];
    commands.sort((a, b) => a.name.localeCompare(b.name));
    return commands.map((c) => `${c.name} - ${c.description}`).join('\n');
  }

  // Метод для добавления маппинга канала к создателю
  addChannelCreatorMapping(channelId: number, creatorId: number) {
    this.channelCreatorMapping.set(channelId, creatorId);
    console.log(`Added channel mapping: ${channelId} -> ${creatorId}`);
  }

  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private buildTwoPinsStaticMapUrls(
    userLat: number,
    userLon: number,
    barLat: number,
    barLon: number,
    distanceKm: number,
  ): string[] {
    const centerLat = (userLat + barLat) / 2;
    const centerLon = (userLon + barLon) / 2;
    const zoom = this.getBarMapZoom(distanceKm);
    const osmParams = new URLSearchParams({
      center: `${centerLat},${centerLon}`,
      zoom: String(zoom),
      size: '900x540',
      mlat0: String(userLat),
      mlon0: String(userLon),
      mlat1: String(barLat),
      mlon1: String(barLon),
    });
    const osmUrl =
      `https://staticmap.openstreetmap.de/staticmap.php` +
      `?${osmParams.toString()}`;

    // Yandex static maps uses lon,lat order in `ll` and `pt`.
    const yandexParams = new URLSearchParams({
      lang: 'en_US',
      l: 'map',
      z: String(zoom),
      size: '650,450',
      ll: `${centerLon},${centerLat}`,
      pt: `${userLon},${userLat},pm2rdm~${barLon},${barLat},pm2blm`,
    });
    const yandexUrl = `https://static-maps.yandex.ru/1.x/?${yandexParams.toString()}`;

    return [osmUrl, yandexUrl];
  }

  private getBarMapZoom(distanceKm: number): number {
    // Higher zoom for short distances, so points appear closer to map edges.
    if (distanceKm <= 0.4) return 17;
    if (distanceKm <= 0.8) return 16;
    if (distanceKm <= 1.5) return 15;
    if (distanceKm <= 3) return 14;
    if (distanceKm <= 7) return 13;
    if (distanceKm <= 15) return 12;
    return 11;
  }

  // Добавляем метод для обработки webhook-обновлений
  async handleWebhook(update: Update) {
    return this.bot.handleUpdate(update);
  }
}
