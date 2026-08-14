import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { GoogleSessionGuard } from '../auth/google-session.guard';

@Controller('gtd')
export class GtdPagesController {
  @UseGuards(GoogleSessionGuard) @Get() async page(@Res() res: Response) {
    res.type('html').send(await this.loadHtml());
  }
  @UseGuards(GoogleSessionGuard) @Get('link') async link(@Res() res: Response) {
    res.type('html').send(await this.loadHtml());
  }
  private loadHtml() {
    return readFile(
      path.join(process.cwd(), 'telegram-app', 'dist', 'index.html'),
      'utf8',
    );
  }
}
