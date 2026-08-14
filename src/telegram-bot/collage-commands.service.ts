import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../services/storage.service';
import * as sharp from 'sharp';

@Injectable()
export class CollageCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private readonly sessions: Map<number, Buffer[]> = new Map();
  private readonly awaitingCircleSize: Set<number> = new Set();

  isActive(chatId: number): boolean {
    return this.sessions.has(chatId);
  }

  async startConversation(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    this.sessions.set(chatId, []);
    this.awaitingCircleSize.delete(chatId);
    await ctx.reply('Отправьте изображение 1', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: 'collage_cancel' }],
        ],
      },
    });
  }

  async addImage(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.message || !('photo' in ctx.message)) return;
    const session = this.sessions.get(chatId);
    if (!session) return;
    const photos = ctx.message.photo;
    const file = await ctx.telegram.getFile(photos[photos.length - 1].file_id);
    const buffer = await this.downloadPhoto(file.file_path!);
    session.push(buffer);

    const buttons = [[{ text: '❌ Отмена', callback_data: 'collage_cancel' }]];
    if (session.length >= 3) {
      buttons[0].push({
        text: '✅ Сгенерировать',
        callback_data: 'collage_generate',
      });
    }
    if (session.length === 5) {
      buttons.push([
        {
          text: '🌟 Особый коллаж',
          callback_data: 'collage_generate_special',
        },
        {
          text: '⭕ Круглый коллаж',
          callback_data: 'collage_generate_special2',
        },
      ]);
    }

    await ctx.reply(`Изображение ${session.length} добавлено.`, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async cancel(ctx: Context) {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return;
    this.sessions.delete(chatId);
    this.awaitingCircleSize.delete(chatId);
    if ('callbackQuery' in ctx) {
      await ctx.answerCbQuery();
      await ctx.editMessageText('Создание коллажа отменено');
    } else {
      // For other context types, we'll use a type assertion
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Создание коллажа отменено',
      );
    }
  }

  async generate(ctx: Context) {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return;
    const images = this.sessions.get(chatId);
    if (!images || images.length < 2) {
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Нужно минимум 2 изображения',
      );
      return;
    }

    await ctx.answerCbQuery();
    await (
      ctx as Context & {
        editMessageReplyMarkup: (
          markup: InlineKeyboardMarkup | undefined,
        ) => Promise<void>;
      }
    ).editMessageReplyMarkup(undefined);
    await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
      'Создаю коллаж...',
    );
    try {
      const collageBuffer = await this.createCollage(images);
      const collageUrl = await this.storageService.uploadFile(
        collageBuffer,
        'image/jpeg',
        chatId,
      );
      await (
        ctx as Context & {
          replyWithPhoto: (
            url: string,
            options: { caption?: string },
          ) => Promise<void>;
        }
      ).replyWithPhoto(collageUrl, {
        caption: 'Коллаж из изображений',
      });
    } catch (error) {
      console.error('Error creating collage:', error);
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Произошла ошибка при создании коллажа',
      );
    } finally {
      this.sessions.delete(chatId);
      this.awaitingCircleSize.delete(chatId);
    }
  }

  async generateSpecial(ctx: Context) {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return;
    const images = this.sessions.get(chatId);
    if (!images || images.length < 5) {
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Нужно 5 изображений для этого коллажа',
      );
      return;
    }

    await ctx.answerCbQuery();
    await (
      ctx as Context & {
        editMessageReplyMarkup: (
          markup: InlineKeyboardMarkup | undefined,
        ) => Promise<void>;
      }
    ).editMessageReplyMarkup(undefined);
    await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
      'Создаю особый коллаж...',
    );
    try {
      const collageBuffer = await this.createSpecialCollage(images);
      const collageUrl = await this.storageService.uploadFile(
        collageBuffer,
        'image/jpeg',
        chatId,
      );
      await (
        ctx as Context & {
          replyWithPhoto: (
            url: string,
            options: { caption?: string },
          ) => Promise<void>;
        }
      ).replyWithPhoto(collageUrl, {
        caption: 'Коллаж из изображений',
      });
    } catch (error) {
      console.error('Error creating collage:', error);
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Произошла ошибка при создании коллажа',
      );
    } finally {
      this.sessions.delete(chatId);
    }
  }

  async askCircleSize(ctx: Context) {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return;
    const images = this.sessions.get(chatId);
    if (!images || images.length < 5) {
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Нужно 5 изображений для этого коллажа',
      );
      return;
    }

    await ctx.answerCbQuery();
    await (
      ctx as Context & {
        editMessageReplyMarkup: (
          markup: InlineKeyboardMarkup | undefined,
        ) => Promise<void>;
      }
    ).editMessageReplyMarkup(undefined);

    this.awaitingCircleSize.add(chatId);
    await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
      'Выберите размер круглого изображения',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '50%', callback_data: 'circle_size_50' },
              { text: '60%', callback_data: 'circle_size_60' },
              { text: '70%', callback_data: 'circle_size_70' },
            ],
            [
              { text: '80%', callback_data: 'circle_size_80' },
              { text: '90%', callback_data: 'circle_size_90' },
            ],
          ],
        },
      },
    );
  }

  async generateSpecial2(ctx: Context, sizePercent = 80) {
    const chatId = ctx.chat?.id || ctx.from?.id;
    if (!chatId) return;
    const images = this.sessions.get(chatId);
    if (!images || images.length < 5) {
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Нужно 5 изображений для этого коллажа',
      );
      return;
    }

    if (this.awaitingCircleSize.has(chatId)) {
      this.awaitingCircleSize.delete(chatId);
    }

    await ctx.answerCbQuery();
    await (
      ctx as Context & {
        editMessageReplyMarkup: (
          markup: InlineKeyboardMarkup | undefined,
        ) => Promise<void>;
      }
    ).editMessageReplyMarkup(undefined);
    await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
      'Создаю особый коллаж...',
    );
    try {
      const collageBuffer = await this.createSpecialCollageCircle(
        images,
        sizePercent,
      );
      const collageUrl = await this.storageService.uploadFile(
        collageBuffer,
        'image/jpeg',
        chatId,
      );
      await (
        ctx as Context & {
          replyWithPhoto: (
            url: string,
            options: { caption?: string },
          ) => Promise<void>;
        }
      ).replyWithPhoto(collageUrl, {
        caption: 'Коллаж из изображений',
      });
    } catch (error) {
      console.error('Error creating collage:', error);
      await (ctx as Context & { reply: (text: string) => Promise<void> }).reply(
        'Произошла ошибка при создании коллажа',
      );
    } finally {
      this.sessions.delete(chatId);
    }
  }

  async handleCollageCommand(ctx: Context) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      // Get images from the current message
      const images = await this.getImagesFromMessage(ctx);

      if (images.length < 2) {
        await ctx.reply(
          'Для создания коллажа нужно минимум 2 изображения в одном сообщении.',
        );
        return;
      }

      console.log(`🎨 Creating collage from ${images.length} images`);

      // Create collage
      const collageBuffer = await this.createCollage(images);

      // Upload collage to storage
      const collageUrl = await this.storageService.uploadFile(
        collageBuffer,
        'image/jpeg',
        chatId,
      );

      // Send collage
      await ctx.replyWithPhoto(collageUrl, {
        caption: 'Коллаж из изображений',
      });
    } catch (error) {
      console.error('Error creating collage:', error);
      await ctx.reply('Произошла ошибка при создании коллажа');
    }
  }

  private async getImagesFromMessage(ctx: Context): Promise<Buffer[]> {
    const images: Buffer[] = [];

    // Check if this is a message with multiple photos
    if ('message' in ctx && ctx.message && 'photo' in ctx.message) {
      const photos = ctx.message.photo;
      if (photos && photos.length > 0) {
        console.log(`📸 Found ${photos.length} photos in message`);
        // Download all photos from the message
        for (const photo of photos) {
          const file = await ctx.telegram.getFile(photo.file_id);
          const photoBuffer = await this.downloadPhoto(file.file_path!);
          images.push(photoBuffer);
        }
      }
    }

    return images;
  }

  private async downloadPhoto(filePath: string): Promise<Buffer> {
    const response = await fetch(
      `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`,
    );
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async createCollage(imageBuffers: Buffer[]): Promise<Buffer> {
    try {
      if (imageBuffers.length < 2) {
        throw new Error('Need at least 2 images for collage');
      }

      // Get metadata of all images to determine optimal dimensions
      const imageMetadata = await Promise.all(
        imageBuffers.map(async (buffer, index) => {
          const metadata = await sharp(buffer).metadata();
          if (!metadata.width || !metadata.height) {
            throw new Error(`Could not get metadata for image ${index}`);
          }
          return { ...metadata, index };
        }),
      );

      // Use the first image as the main image
      const mainImageMetadata = imageMetadata[0];

      console.log(
        `📐 Main image chosen from index 0: ${mainImageMetadata.width}x${mainImageMetadata.height}`,
      );

      // Ensure minimum size for better layout
      const minWidth = 800;
      const minHeight = 600;

      let mainImageWidth = Math.max(mainImageMetadata.width, minWidth);
      let mainImageHeight = Math.max(mainImageMetadata.height, minHeight);

      // If the first image is smaller than minimum, scale it up proportionally
      if (
        mainImageMetadata.width < minWidth ||
        mainImageMetadata.height < minHeight
      ) {
        const scaleX = minWidth / mainImageMetadata.width;
        const scaleY = minHeight / mainImageMetadata.height;
        const scale = Math.max(scaleX, scaleY);
        mainImageWidth = Math.round(mainImageMetadata.width * scale);
        mainImageHeight = Math.round(mainImageMetadata.height * scale);
      }

      const spacing = 5; // Small gap between images

      console.log(
        `📐 Final main image dimensions: ${mainImageWidth}x${mainImageHeight}`,
      );

      // Calculate dimensions for additional images
      const additionalImagesCount = imageBuffers.length - 1;
      const totalSpacing = (additionalImagesCount - 1) * spacing;
      const availableWidth = mainImageWidth - totalSpacing;
      const additionalImageWidth = Math.floor(
        availableWidth / additionalImagesCount,
      );

      // Calculate heights for all additional images first
      let maxAdditionalHeight = 0;
      const additionalImageHeights: number[] = [];

      for (let i = 1; i < imageBuffers.length; i++) {
        const metadata = imageMetadata[i];
        // Calculate height to preserve aspect ratio
        const aspectRatio = metadata.width / metadata.height;
        const additionalImageHeight = Math.floor(
          additionalImageWidth / aspectRatio,
        );
        additionalImageHeights.push(additionalImageHeight);
        maxAdditionalHeight = Math.max(
          maxAdditionalHeight,
          additionalImageHeight,
        );

        console.log(
          `📐 Additional image ${i}: ${additionalImageWidth}x${additionalImageHeight} (original: ${metadata.width}x${metadata.height})`,
        );
      }

      // Calculate total dimensions
      const totalWidth = mainImageWidth;
      const totalHeight = mainImageHeight + spacing + maxAdditionalHeight;

      console.log(`📐 Collage dimensions: ${totalWidth}x${totalHeight}`);
      console.log(`📐 Main image: ${mainImageWidth}x${mainImageHeight}`);
      console.log(`📐 Additional images width: ${additionalImageWidth}`);
      console.log(`📐 Max additional height: ${maxAdditionalHeight}`);
      console.log(
        `📐 Total spacing: ${totalSpacing}px, Available width: ${availableWidth}px`,
      );

      // Create canvas
      const canvas = sharp({
        create: {
          width: totalWidth,
          height: totalHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }, // White background
        },
      });

      // Create composite array
      const composite: sharp.OverlayOptions[] = [];

      // Add main image (first image) at the top
      const mainImageBuffer = await sharp(imageBuffers[0])
        .resize(mainImageWidth, mainImageHeight, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();

      composite.push({
        input: mainImageBuffer,
        left: 0,
        top: 0,
      });

      // Add additional images in a row below
      let additionalIndex = 0;
      for (let i = 1; i < imageBuffers.length; i++) {
        const processedImage = await sharp(imageBuffers[i])
          .resize(
            additionalImageWidth,
            additionalImageHeights[additionalIndex],
            { fit: 'inside' },
          )
          .jpeg({ quality: 80 })
          .toBuffer();

        const left = additionalIndex * (additionalImageWidth + spacing);
        composite.push({
          input: processedImage,
          left,
          top: mainImageHeight + spacing,
        });

        additionalIndex++;
      }

      // Create final collage
      const collageBuffer = await canvas
        .composite(composite)
        .jpeg({ quality: 90 })
        .toBuffer();

      return collageBuffer;
    } catch (error) {
      console.error('Error in createCollage:', error);
      throw error;
    }
  }

  private async createSpecialCollage(imageBuffers: Buffer[]): Promise<Buffer> {
    try {
      if (imageBuffers.length < 5) {
        throw new Error('Need 5 images for special collage');
      }

      const mainMetadata = await sharp(imageBuffers[0]).metadata();
      if (!mainMetadata.width || !mainMetadata.height) {
        throw new Error('Could not get main image dimensions');
      }

      const width = mainMetadata.width;
      const height = mainMetadata.height;
      const halfWidth = Math.floor(width / 2);
      const halfHeight = Math.floor(height / 2);

      const spacing = 5; // space between background images
      const bgWidth = Math.floor((width - spacing) / 2);
      const bgHeight = Math.floor((height - spacing) / 2);

      const canvas = sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      });

      const composite: sharp.OverlayOptions[] = [];

      const positions = [
        { left: 0, top: 0 },
        { left: bgWidth + spacing, top: 0 },
        { left: 0, top: bgHeight + spacing },
        { left: bgWidth + spacing, top: bgHeight + spacing },
      ];

      for (let i = 1; i <= 4; i++) {
        const processed = await sharp(imageBuffers[i])
          .resize(bgWidth, bgHeight, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();
        composite.push({
          input: processed,
          left: positions[i - 1].left,
          top: positions[i - 1].top,
        });
      }

      const border = 5;
      const mainResized = await sharp(imageBuffers[0])
        .resize(halfWidth, halfHeight, { fit: 'inside' })
        .extend({
          top: border,
          bottom: border,
          left: border,
          right: border,
          background: { r: 255, g: 255, b: 255 },
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      const mainLeft = Math.floor((width - halfWidth) / 2) - border;
      const mainTop = Math.floor((height - halfHeight) / 2) - border;

      composite.push({ input: mainResized, left: mainLeft, top: mainTop });

      const result = await canvas
        .composite(composite)
        .jpeg({ quality: 90 })
        .toBuffer();
      return result;
    } catch (error) {
      console.error('Error in createSpecialCollage:', error);
      throw error;
    }
  }

  private async createSpecialCollageCircle(
    imageBuffers: Buffer[],
    sizePercent = 80,
  ): Promise<Buffer> {
    try {
      if (imageBuffers.length < 5) {
        throw new Error('Need 5 images for special collage');
      }

      const mainMetadata = await sharp(imageBuffers[0]).metadata();
      if (!mainMetadata.width || !mainMetadata.height) {
        throw new Error('Could not get main image dimensions');
      }

      const width = mainMetadata.width;
      const height = mainMetadata.height;
      const spacing = 5;
      const bgWidth = Math.floor((width - spacing) / 2);
      const bgHeight = Math.floor((height - spacing) / 2);

      const canvas = sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      });

      const composite: sharp.OverlayOptions[] = [];

      const positions = [
        { left: 0, top: 0 },
        { left: bgWidth + spacing, top: 0 },
        { left: 0, top: bgHeight + spacing },
        { left: bgWidth + spacing, top: bgHeight + spacing },
      ];

      for (let i = 1; i <= 4; i++) {
        const processed = await sharp(imageBuffers[i])
          .resize(bgWidth, bgHeight, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();
        composite.push({
          input: processed,
          left: positions[i - 1].left,
          top: positions[i - 1].top,
        });
      }

      const diameter = Math.floor(
        Math.min(width, height) *
          (Math.min(Math.max(sizePercent, 10), 100) / 100),
      );
      const border = 5;

      const circleSvg = Buffer.from(
        `<svg width="${diameter}" height="${diameter}"><circle cx="${
          diameter / 2
        }" cy="${diameter / 2}" r="${diameter / 2}" fill="white" /></svg>`,
      );

      const baseCircle = await sharp(imageBuffers[0])
        .resize(diameter, diameter, { fit: 'cover', position: 'centre' })
        .composite([{ input: circleSvg, blend: 'dest-in' }])
        .png()
        .toBuffer();

      const borderSvg = Buffer.from(
        `<svg width="${diameter + border * 2}" height="${
          diameter + border * 2
        }"><circle cx="${(diameter + border * 2) / 2}" cy="${
          (diameter + border * 2) / 2
        }" r="${diameter / 2 + border}" fill="white" /></svg>`,
      );

      const mainCircle = await sharp(borderSvg)
        .composite([{ input: baseCircle, left: border, top: border }])
        .png()
        .toBuffer();

      const mainLeft = Math.floor((width - (diameter + border * 2)) / 2);
      const mainTop = Math.floor((height - (diameter + border * 2)) / 2);

      composite.push({ input: mainCircle, left: mainLeft, top: mainTop });

      const result = await canvas
        .composite(composite)
        .jpeg({ quality: 90 })
        .toBuffer();
      return result;
    } catch (error) {
      console.error('Error in createSpecialCollageCircle:', error);
      throw error;
    }
  }
}
