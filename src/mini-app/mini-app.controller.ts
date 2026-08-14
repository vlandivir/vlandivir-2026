import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { validate, parse } from '@telegram-apps/init-data-node';
import type { Response } from 'express';

type TelegramInitData = ReturnType<typeof parse>;

@Controller('mini-app-api')
export class MiniAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Index HTML is now served by static frontend under `/mini-app` via Vite build
  // from the telegram-app/ directory.

  @Get('user')
  async getUser(@Query('initData') initData?: string) {
    try {
      const parsed = this.parseAndVerifyInitData(initData || '');
      const userId = parsed.user?.id;
      if (!userId) return { error: 'No user' };

      // userId is number; in DB chatId is BigInt. Use BigInt for filtering
      const chatId = BigInt(userId);
      const notes = await this.prisma.note.count({ where: { chatId } });

      const userSummary = [
        parsed.user?.firstName,
        parsed.user?.lastName,
        parsed.user?.username ? '(' + parsed.user?.username + ')' : undefined,
      ]
        .filter(Boolean)
        .join(' ');

      const initials =
        (
          (parsed.user?.firstName?.[0] || '') +
          (parsed.user?.lastName?.[0] || '')
        ).toUpperCase() ||
        parsed.user?.username?.slice(0, 2).toUpperCase() ||
        'U';
      return {
        userId,
        userSummary,
        username: parsed.user?.username || null,
        initials,
        hasAvatar: true, // actual presence checked in avatar endpoint; keep true to try load
        counts: { notes },
      };
    } catch (e) {
      return { error: `Invalid initData ${e}` };
    }
  }

  @Get('avatar')
  @Header('Cache-Control', 'public, max-age=300')
  async avatar(@Query('userId') userIdParam: string, @Res() res: Response) {
    try {
      const userId = Number(userIdParam);
      if (!userId) {
        res.status(400).send('Bad userId');
        return;
      }
      const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
      if (!token) {
        res.status(500).send('No token');
        return;
      }
      const apiBase = `https://api.telegram.org/bot${token}`;
      const photosResp = await fetch(
        `${apiBase}/getUserProfilePhotos?user_id=${userId}&limit=1`,
      );
      const photosJson = (await photosResp.json()) as {
        ok: boolean;
        result?: {
          total_count: number;
          photos: Array<Array<{ file_id: string }>>;
        };
      };
      if (
        !photosJson.ok ||
        !photosJson.result ||
        photosJson.result.total_count === 0
      ) {
        res.status(404).send('No avatar');
        return;
      }
      const sizes = photosJson.result.photos[0];
      const fileId = sizes[sizes.length - 1].file_id;

      const fileResp = await fetch(`${apiBase}/getFile?file_id=${fileId}`);
      const fileJson = (await fileResp.json()) as {
        ok: boolean;
        result?: { file_path: string };
      };
      if (!fileJson.ok || !fileJson.result) {
        res.status(404).send('No file');
        return;
      }
      const filePath = fileJson.result.file_path;
      const imgResp = await fetch(
        `https://api.telegram.org/file/bot${token}/${filePath}`,
      );
      const buffer = Buffer.from(await imgResp.arrayBuffer());
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(buffer);
    } catch (e) {
      res.status(500).send(`Error ${e}`);
    }
  }

  private parseAndVerifyInitData(raw: string): TelegramInitData {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('No token');
    // Validate signature (throws on invalid/expired by default)
    validate(raw, token);
    return parse(raw);
  }
}
