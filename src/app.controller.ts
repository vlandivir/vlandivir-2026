import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHome(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'home', 'index.html'));
  }

  @Get('en')
  getHomeEn(@Res() res: Response): void {
    // Single-file i18n: the same page serves both languages; /shared/i18n.js
    // detects the language from the /en path segment.
    res.sendFile(path.join(process.cwd(), 'web', 'home', 'index.html'));
  }

  @Get('health')
  getHealth(): string {
    return this.appService.getHello();
  }

  @Get('home')
  getHomeAlias(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'home', 'index.html'));
  }

  @Get('home/en')
  getHomeEnAlias(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'home', 'index.html'));
  }

  @Get('gpx-route-png')
  getGpxRoutePng(@Res() res: Response): void {
    res.sendFile(
      path.join(process.cwd(), 'web', 'gpx-route-png', 'index.html'),
    );
  }

  @Get('gpx-route-png/en')
  getGpxRoutePngEn(@Res() res: Response): void {
    res.sendFile(
      path.join(process.cwd(), 'web', 'gpx-route-png', 'index.html'),
    );
  }

  @Get('gpx-route-png/en/:videoId')
  getGpxRoutePngEnVideoPage(@Res() res: Response): void {
    res.sendFile(
      path.join(process.cwd(), 'web', 'gpx-route-png', 'index.html'),
    );
  }

  @Get('gpx-route-png/:videoId')
  getGpxRoutePngVideoPage(@Res() res: Response): void {
    res.sendFile(
      path.join(process.cwd(), 'web', 'gpx-route-png', 'index.html'),
    );
  }

  @Get('gpx-track-demo')
  getGpxTrackDemo(@Res() res: Response): void {
    res.sendFile(
      path.join(process.cwd(), 'web', 'gpx-track-demo', 'index.html'),
    );
  }

  @Get('subs')
  getSubs(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'subs', 'index.html'));
  }

  @Get('subs/en')
  getSubsEn(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'subs', 'index.html'));
  }

  @Get('subs/en/:hash')
  getSubsEnVideoPage(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'subs', 'index.html'));
  }

  @Get('subs/:hash')
  getSubsVideoPage(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'subs', 'index.html'));
  }

  @Get('font')
  getFontPicker(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'subs', 'font', 'index.html'));
  }

  @Get('subs/archive')
  getSubsArchive(@Res() res: Response): void {
    res.sendFile(
      path.join(process.cwd(), 'web', 'subs', 'archive', 'index.html'),
    );
  }

  @Get('files')
  getFiles(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'files', 'index.html'));
  }

  @Get('files/en')
  getFilesEn(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'files', 'index.html'));
  }

  @Get('trip')
  getTrip(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'trip', 'index.html'));
  }

  @Get('trip/en')
  getTripEn(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'trip', 'index.html'));
  }

  @Get('trip/en/:secret')
  getTripEnSecret(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'trip', 'index.html'));
  }

  @Get('trip/:secret')
  getTripSecret(@Res() res: Response): void {
    res.sendFile(path.join(process.cwd(), 'web', 'trip', 'index.html'));
  }
}
