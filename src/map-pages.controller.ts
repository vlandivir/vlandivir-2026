import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from './prisma/prisma.service';

// Serves the map SPA for share links like /places/point/3 with
// per-feature Open Graph tags injected, so messengers and social networks
// show a proper title, description and cover preview.
@Controller('places')
export class MapPagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('point/:id')
  async pointPage(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.sendPage('point', Number(id), req, res);
  }

  @Get('track/:id')
  async trackPage(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.sendPage('track', Number(id), req, res);
  }

  private async sendPage(
    kind: 'point' | 'track',
    id: number,
    req: Request,
    res: Response,
  ) {
    const html = await readFile(
      path.join(process.cwd(), 'web', 'places', 'index.html'),
      'utf8',
    );

    const record = Number.isInteger(id)
      ? kind === 'point'
        ? await this.prisma.mapPoint.findUnique({ where: { id } })
        : await this.prisma.mapTrack.findUnique({ where: { id } })
      : null;

    if (!record) {
      res.type('html').send(html);
      return;
    }

    const meta = record.instagramMeta as {
      caption?: string;
      coverUrl?: string;
      thumbnailUrl?: string;
      username?: string;
    } | null;

    // The shared Reel table has stable covers and richer texts for features
    // whose Instagram link went through the reels pipeline
    const shortcode = record.instagramUrl
      ? /instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(
          record.instagramUrl,
        )?.[1]
      : null;
    const reel = shortcode
      ? await this.prisma.reel.findUnique({ where: { shortcode } })
      : null;

    const baseUrl =
      process.env.VLANDIVIR_2025_BASE_URL ||
      `${req.protocol}://${req.get('host')}`;
    const title = `${record.name} — Карта Сербии и окресностей :)`;
    // Messenger previews are one-liners: collapse the newlines Instagram
    // captions are full of, and keep the text short
    const description = (
      record.description ||
      meta?.caption ||
      reel?.description ||
      reel?.visionDescription ||
      this.fallbackDescription(kind, record)
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    // Only stable image URLs: Instagram thumbnailUrl is signed and expires,
    // so messengers that fetch the preview later get a broken picture
    const image =
      meta?.coverUrl || reel?.coverUrl || `${baseUrl}/shared/og-places.png`;

    const tags = [
      `<meta property="og:type" content="article" />`,
      `<meta property="og:title" content="${this.escape(title)}" />`,
      `<meta property="og:description" content="${this.escape(description)}" />`,
      `<meta property="og:url" content="${this.escape(`${baseUrl}/places/${kind}/${record.id}`)}" />`,
      `<meta property="og:image" content="${this.escape(image)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ].join('\n  ');

    const page = html
      .replace(/<title>[^<]*<\/title>/, `<title>${this.escape(title)}</title>`)
      .replace('</head>', `  ${tags}\n</head>`);
    res.type('html').send(page);
  }

  private fallbackDescription(
    kind: 'point' | 'track',
    record: {
      name: string;
      tags?: string[];
      latitude?: number;
      longitude?: number;
    },
  ): string {
    const parts = [
      kind === 'track'
        ? `Маршрут «${record.name}» на карте моих мест`
        : `«${record.name}» — точка на карте моих мест`,
    ];
    if (record.tags?.length) {
      parts.push(record.tags.join(', '));
    }
    if (
      kind === 'point' &&
      typeof record.latitude === 'number' &&
      typeof record.longitude === 'number'
    ) {
      parts.push(
        `Координаты: ${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`,
      );
    }
    return parts.join(' · ');
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
