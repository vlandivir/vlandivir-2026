import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { AdminSessionGuard } from './auth/admin-session.guard';
import { ThreadsNewsService } from './services/threads-news.service';

@UseGuards(AdminSessionGuard)
@Controller('threads-news-api')
export class ThreadsNewsApiController {
  constructor(private readonly news: ThreadsNewsService) {}
  @Get('dashboard') dashboard() {
    return this.news.dashboard();
  }
  @Get('posts') posts(
    @Query('sourceId') sourceId?: string,
    @Query('page') page?: string,
    @Query('feedback') feedback?: string,
  ) {
    return this.news.posts(
      sourceId === undefined ? undefined : Number(sourceId),
      page === undefined ? 1 : Number(page),
      feedback ?? 'all',
    );
  }
  @Get('review') review() {
    return this.news.review();
  }
  @Post('posts/:id/feedback') feedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { value?: unknown },
  ) {
    return this.news.setFeedback(id, body?.value);
  }
  @Post('sources') add(@Body() body: { profile?: unknown; topics?: unknown }) {
    return this.news.add(body || {});
  }
  @Patch('sources/:id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { enabled?: unknown; topics?: unknown },
  ) {
    return this.news.update(id, body || {});
  }
  @Post('sources/:id/refresh') refresh(@Param('id', ParseIntPipe) id: number) {
    return this.news.refresh(id);
  }
  @Delete('sources/:id') remove(@Param('id', ParseIntPipe) id: number) {
    return this.news.remove(id);
  }
  @Post('posts/:id/translate') translate(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.news.translate(id);
  }
}

@UseGuards(AdminSessionGuard)
@Controller('threads-news')
export class ThreadsNewsPagesController {
  @Get(['', 'en', 'index.html']) async page(@Res() res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    res
      .type('html')
      .send(
        await readFile(
          path.join(process.cwd(), 'web', 'threads-news', 'index.html'),
          'utf8',
        ),
      );
  }
  @Get(':asset') async asset(
    @Param('asset') asset: string,
    @Res() res: Response,
  ) {
    if (!['app.js', 'i18n.js', 'styles.css'].includes(asset)) {
      res.sendStatus(404);
      return;
    }
    res
      .type(asset.endsWith('.css') ? 'css' : 'js')
      .send(
        await readFile(
          path.join(process.cwd(), 'web', 'threads-news', asset),
          'utf8',
        ),
      );
  }
}
