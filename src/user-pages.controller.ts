import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { GoogleSessionGuard } from './auth/google-session.guard';
import type { SessionUser } from './auth/auth.service';
import { ToolPagesService } from './services/tool-pages.service';
import type { ToolKind, UserToolPage } from './services/tool-pages.types';

type UpsertPageBody = {
  kind?: string;
  hash?: string;
  title?: string;
  pageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

const KINDS = new Set<ToolKind>(['subs', 'gpx']);

@Controller('user-pages-api')
@UseGuards(GoogleSessionGuard)
export class UserPagesController {
  constructor(private readonly toolPages: ToolPagesService) {}

  @Get('pages')
  async list(@Req() request: Request) {
    const user = this.user(request);
    return { pages: await this.toolPages.listUserPages(user.email) };
  }

  @Post('pages')
  async upsert(@Req() request: Request, @Body() body: UpsertPageBody) {
    const user = this.user(request);
    const page = this.parsePage(body);
    const pages = await this.toolPages.upsertUserPage(user.email, page);
    return { page, pages };
  }

  @Post('pages/import')
  async importPages(
    @Req() request: Request,
    @Body() body: { pages?: UpsertPageBody[] },
  ) {
    const user = this.user(request);
    const raw = Array.isArray(body.pages) ? body.pages.slice(0, 200) : [];
    const pages = await this.toolPages.importUserPages(
      user.email,
      raw.map((item) => this.parsePage(item)),
    );
    return { pages };
  }

  private user(request: Request): SessionUser {
    return (request as Request & { user: SessionUser }).user;
  }

  private parsePage(body: UpsertPageBody): UserToolPage {
    const kind = body.kind;
    if (!kind || !KINDS.has(kind as ToolKind)) {
      throw new BadRequestException('kind must be subs or gpx');
    }
    const hash = (body.hash || '').trim();
    this.toolPages.assertHash(hash);
    const title = (body.title || hash).trim().slice(0, 200) || hash;
    const pageUrl = this.parsePageUrl(kind as ToolKind, hash, body.pageUrl);
    const now = new Date().toISOString();
    return {
      kind: kind as ToolKind,
      hash,
      title,
      pageUrl,
      createdAt: this.parseTimestamp(body.createdAt, now),
      updatedAt: this.parseTimestamp(body.updatedAt, now),
    };
  }

  private parseTimestamp(raw: unknown, fallback: string): string {
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toISOString();
  }

  private parsePageUrl(kind: ToolKind, hash: string, raw?: string): string {
    const fallback = kind === 'subs' ? `/subs/${hash}` : `/gpx-route-png/${hash}`;
    const value = (raw || '').trim();
    if (!value.startsWith('/') || value.startsWith('//')) return fallback;
    if (value.length > 300) return fallback;
    return value;
  }
}
