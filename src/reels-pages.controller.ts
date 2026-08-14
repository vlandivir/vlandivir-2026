import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { AuthService } from './auth/auth.service';
import { GoogleSessionGuard } from './auth/google-session.guard';
import { PrismaService } from './prisma/prisma.service';

// The reels notebook lives at /reels behind Google sign-in. Old unlisted
// URLs with a page secret (/reels/<secret>[/<id>]) are gone: they redirect
// to the protected form, so a signed-in owner lands on the same reel and
// everyone else hits the Google sign-in wall.
@Controller('reels')
export class ReelsPagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @UseGuards(GoogleSessionGuard)
  @Get()
  async page(@Res() res: Response) {
    res.type('html').send(await this.loadHtml());
  }

  // /reels/<id> — deep link to one reel; anything non-numeric is a legacy
  // secret URL and goes to the protected root.
  @Get(':id')
  async reelPage(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!/^\d+$/.test(id)) {
      res.redirect('/reels');
      return;
    }
    if (!this.requireSession(req, res)) return;
    res.type('html').send(await this.reelHtml(Number(id)));
  }

  // Legacy share links /reels/<secret>/<id> → protected deep link
  @Get(':secret/:id')
  legacyShareLink(@Param('id') id: string, @Res() res: Response) {
    if (!/^\d+$/.test(id)) {
      throw new NotFoundException();
    }
    res.redirect(301, `/reels/${id}`);
  }

  private requireSession(req: Request, res: Response): boolean {
    if (this.authService.getSessionFromRequest(req)) return true;
    const redirect = encodeURIComponent(
      this.authService.safeRedirectPath(req.originalUrl),
    );
    res.redirect(`/auth/google?redirect=${redirect}`);
    return false;
  }

  // SPA with Open Graph tags for the reel so previews show title and cover
  private async reelHtml(reelId: number): Promise<string> {
    let html = await this.loadHtml();

    const reel = Number.isInteger(reelId)
      ? await this.prisma.reel.findUnique({ where: { id: reelId } })
      : null;

    if (reel) {
      const title = reel.title || reel.shortcode;
      const description = (reel.description || '').slice(0, 200);
      const tags = [
        `<meta property="og:type" content="video.other" />`,
        `<meta property="og:title" content="${this.escape(title)}" />`,
        ...(description
          ? [
              `<meta property="og:description" content="${this.escape(description)}" />`,
            ]
          : []),
        ...(reel.coverUrl
          ? [
              `<meta property="og:image" content="${this.escape(reel.coverUrl)}" />`,
              `<meta name="twitter:card" content="summary_large_image" />`,
            ]
          : []),
      ].join('\n  ');
      html = html
        .replace(
          /<title>[^<]*<\/title>/,
          `<title>${this.escape(title)}</title>`,
        )
        .replace('</head>', `  ${tags}\n</head>`);
    }

    return html;
  }

  private loadHtml(): Promise<string> {
    return readFile(
      path.join(process.cwd(), 'web', 'reels', 'index.html'),
      'utf8',
    );
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
