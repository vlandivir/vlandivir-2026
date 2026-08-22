import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { AdminSessionGuard } from './auth/admin-session.guard';

@Controller('threads')
export class ThreadsPagesController {
  @UseGuards(AdminSessionGuard)
  @Get()
  async page(@Res() res: Response) {
    const html = await readFile(
      path.join(process.cwd(), 'web', 'threads', 'index.html'),
      'utf8',
    );
    res.type('html').send(html);
  }
}
