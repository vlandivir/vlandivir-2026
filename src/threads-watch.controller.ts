import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { AdminSessionGuard } from './auth/admin-session.guard';
import { ThreadsWatchService } from './services/threads-watch.service';

@UseGuards(AdminSessionGuard)
@Controller('threads-watch-api')
export class ThreadsWatchApiController {
  constructor(private readonly watch: ThreadsWatchService) {}
  @Get('posts') list() {
    return this.watch.list();
  }
  @Post('posts') add(@Body() body: { url?: unknown }) {
    return this.watch.add(body.url);
  }
  @Post('posts/:id/refresh') refresh(@Param('id', ParseIntPipe) id: number) {
    return this.watch.refresh(id);
  }
  @Delete('posts/:id') remove(@Param('id', ParseIntPipe) id: number) {
    return this.watch.remove(id);
  }
  @Get('posts/:id/replies') replies(@Param('id', ParseIntPipe) id: number) {
    return this.watch.replies(id);
  }
  @Post('posts/:id/replies') refreshReplies(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.watch.refreshReplies(id);
  }
}

@UseGuards(AdminSessionGuard)
@Controller('threads-watch')
export class ThreadsWatchPagesController {
  @Get(['', 'en'])
  async page(@Res() res: Response) {
    res
      .type('html')
      .send(
        await readFile(
          path.join(process.cwd(), 'web', 'threads-watch', 'index.html'),
          'utf8',
        ),
      );
  }
}
