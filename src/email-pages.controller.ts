import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { GoogleSessionGuard } from './auth/google-session.guard';

// Email pipeline dashboard, owner-only (Google session).
@Controller('email')
export class EmailPagesController {
  @UseGuards(GoogleSessionGuard)
  @Get()
  async page(@Res() res: Response) {
    const html = await readFile(
      path.join(process.cwd(), 'web', 'email', 'index.html'),
      'utf8',
    );
    res.type('html').send(html);
  }
}
