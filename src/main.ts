import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AppModule } from './app.module';
import { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';

async function bootstrap() {
  const environment = process.env.ENVIRONMENT || 'DEV';
  const port = process.env.PORT || 3000;

  console.log(
    `Starting: environment=${environment} port=${port} tag=${process.env.TAG_NAME || 'local'}`,
  );

  if (environment === 'PROD') {
    let httpsOptions: HttpsOptions;

    try {
      httpsOptions = {
        key: fs.readFileSync(
          path.join(process.cwd(), '.secret', 'privkey.pem'),
        ),
        cert: fs.readFileSync(
          path.join(process.cwd(), '.secret', 'fullchain.pem'),
        ),
      };
    } catch (error) {
      console.error('Ошибка при чтении SSL сертификатов:', error);
      process.exit(1);
    }

    // Создание HTTPS приложения
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      httpsOptions,
    });
    // Serve Telegram Mini App static build
    const telegramAppDist = path.join(process.cwd(), 'telegram-app', 'dist');
    app.useStaticAssets(telegramAppDist, { prefix: '/mini-app' });
    // Main static page assets
    const homePage = path.join(process.cwd(), 'web', 'home');
    app.useStaticAssets(homePage, { prefix: '/home' });
    const sharedAssets = path.join(process.cwd(), 'web', 'shared');
    app.useStaticAssets(sharedAssets, { prefix: '/shared' });
    // Static GPX → PNG tool (plain HTML/CSS/JS)
    const gpxRoutePng = path.join(process.cwd(), 'web', 'gpx-route-png');
    app.useStaticAssets(gpxRoutePng, { prefix: '/gpx-route-png' });
    const filesPage = path.join(process.cwd(), 'web', 'files');
    app.useStaticAssets(filesPage, { prefix: '/files' });
    const tripPage = path.join(process.cwd(), 'web', 'trip');
    app.useStaticAssets(tripPage, {
      prefix: '/trip',
      index: false,
      redirect: false,
    });
    const placesPage = path.join(process.cwd(), 'web', 'places');
    app.useStaticAssets(placesPage, { prefix: '/places' });
    // Assets only (app.js/styles.css); the page itself is served by
    // ReelsPagesController behind Google sign-in (redirect: false keeps
    // serve-static from 301-ing /reels to /reels/ past the controller)
    const reelsPage = path.join(process.cwd(), 'web', 'reels');
    app.useStaticAssets(reelsPage, {
      prefix: '/reels',
      index: false,
      redirect: false,
    });
    // Assets only; the page is served by EmailPagesController behind sign-in
    const emailPage = path.join(process.cwd(), 'web', 'email');
    app.useStaticAssets(emailPage, {
      prefix: '/email',
      index: false,
      redirect: false,
    });
    // Assets only; the page is served by DiaryPagesController behind sign-in
    const diaryPage = path.join(process.cwd(), 'web', 'diary');
    app.useStaticAssets(diaryPage, {
      prefix: '/diary',
      index: false,
      redirect: false,
    });
    const subsPage = path.join(process.cwd(), 'web', 'subs');
    const fontPage = path.join(subsPage, 'font');
    const archivePage = path.join(subsPage, 'archive');
    app.useStaticAssets(subsPage, { prefix: '/subs' });
    app.useStaticAssets(fontPage, { prefix: '/font' });
    app.useStaticAssets(archivePage, { prefix: '/subs/archive' });
    // Fallback to index.html for SPA routes (use RegExp to avoid path-to-regexp issues)
    const instance = app.getHttpAdapter().getInstance();
    instance.get(/^\/places\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(placesPage, 'index.html'));
    });
    instance.get(/^\/mini-app(?:\/.*)?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(telegramAppDist, 'index.html'));
    });
    instance.get(/^\/gpx-route-png\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(gpxRoutePng, 'index.html'));
    });
    instance.get(/^\/gpx-route-png\/en\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(gpxRoutePng, 'index.html'));
    });
    instance.get(
      /^\/gpx-route-png\/en\/[^/]+\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(gpxRoutePng, 'index.html'));
      },
    );
    instance.get(
      /^\/gpx-route-png\/(?!en(?:\/|$))[^/]+\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(gpxRoutePng, 'index.html'));
      },
    );
    instance.get(/^\/files\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(filesPage, 'index.html'));
    });
    instance.get(/^\/files\/en\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(filesPage, 'index.html'));
    });
    instance.get(/^\/trip\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(tripPage, 'index.html'));
    });
    instance.get(/^\/trip\/en\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(tripPage, 'index.html'));
    });
    instance.get(/^\/trip\/en\/[^/]+\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(tripPage, 'index.html'));
    });
    instance.get(
      /^\/trip\/(?!en(?:\/|$))[^/]+\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(tripPage, 'index.html'));
      },
    );
    instance.get(
      /^\/subs(?:\/[a-f0-9]{24})?\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(subsPage, 'index.html'));
      },
    );
    instance.get(
      /^\/subs\/en(?:\/[a-f0-9]{24})?\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(subsPage, 'index.html'));
      },
    );
    instance.get(/^\/font\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(fontPage, 'index.html'));
    });
    instance.get(/^\/subs\/archive\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(archivePage, 'index.html'));
    });
    await app.listen(443);
  } else {
    // Development mode - HTTP
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    // Serve Telegram Mini App static build in dev too (or use Vite dev server separately)
    const telegramAppDist = path.join(process.cwd(), 'telegram-app', 'dist');
    app.useStaticAssets(telegramAppDist, { prefix: '/mini-app' });
    const homePage = path.join(process.cwd(), 'web', 'home');
    app.useStaticAssets(homePage, { prefix: '/home' });
    const sharedAssets = path.join(process.cwd(), 'web', 'shared');
    app.useStaticAssets(sharedAssets, { prefix: '/shared' });
    const gpxRoutePng = path.join(process.cwd(), 'web', 'gpx-route-png');
    app.useStaticAssets(gpxRoutePng, { prefix: '/gpx-route-png' });
    const filesPage = path.join(process.cwd(), 'web', 'files');
    app.useStaticAssets(filesPage, { prefix: '/files' });
    const tripPage = path.join(process.cwd(), 'web', 'trip');
    app.useStaticAssets(tripPage, {
      prefix: '/trip',
      index: false,
      redirect: false,
    });
    const placesPage = path.join(process.cwd(), 'web', 'places');
    app.useStaticAssets(placesPage, { prefix: '/places' });
    // Assets only (app.js/styles.css); the page itself is served by
    // ReelsPagesController behind Google sign-in (redirect: false keeps
    // serve-static from 301-ing /reels to /reels/ past the controller)
    const reelsPage = path.join(process.cwd(), 'web', 'reels');
    app.useStaticAssets(reelsPage, {
      prefix: '/reels',
      index: false,
      redirect: false,
    });
    // Assets only; the page is served by EmailPagesController behind sign-in
    const emailPage = path.join(process.cwd(), 'web', 'email');
    app.useStaticAssets(emailPage, {
      prefix: '/email',
      index: false,
      redirect: false,
    });
    // Assets only; the page is served by DiaryPagesController behind sign-in
    const diaryPage = path.join(process.cwd(), 'web', 'diary');
    app.useStaticAssets(diaryPage, {
      prefix: '/diary',
      index: false,
      redirect: false,
    });
    const subsPage = path.join(process.cwd(), 'web', 'subs');
    const fontPage = path.join(subsPage, 'font');
    const archivePage = path.join(subsPage, 'archive');
    app.useStaticAssets(subsPage, { prefix: '/subs' });
    app.useStaticAssets(fontPage, { prefix: '/font' });
    app.useStaticAssets(archivePage, { prefix: '/subs/archive' });
    const instance = app.getHttpAdapter().getInstance();
    instance.get(/^\/places\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(placesPage, 'index.html'));
    });
    instance.get(/^\/mini-app(?:\/.*)?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(telegramAppDist, 'index.html'));
    });
    instance.get(/^\/gpx-route-png\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(gpxRoutePng, 'index.html'));
    });
    instance.get(/^\/gpx-route-png\/en\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(gpxRoutePng, 'index.html'));
    });
    instance.get(
      /^\/gpx-route-png\/en\/[^/]+\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(gpxRoutePng, 'index.html'));
      },
    );
    instance.get(
      /^\/gpx-route-png\/(?!en(?:\/|$))[^/]+\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(gpxRoutePng, 'index.html'));
      },
    );
    instance.get(/^\/files\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(filesPage, 'index.html'));
    });
    instance.get(/^\/files\/en\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(filesPage, 'index.html'));
    });
    instance.get(/^\/trip\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(tripPage, 'index.html'));
    });
    instance.get(/^\/trip\/en\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(tripPage, 'index.html'));
    });
    instance.get(/^\/trip\/en\/[^/]+\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(tripPage, 'index.html'));
    });
    instance.get(
      /^\/trip\/(?!en(?:\/|$))[^/]+\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(tripPage, 'index.html'));
      },
    );
    instance.get(
      /^\/subs(?:\/[a-f0-9]{24})?\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(subsPage, 'index.html'));
      },
    );
    instance.get(
      /^\/subs\/en(?:\/[a-f0-9]{24})?\/?$/,
      (_req: unknown, res: Response) => {
        res.sendFile(path.join(subsPage, 'index.html'));
      },
    );
    instance.get(/^\/font\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(fontPage, 'index.html'));
    });
    instance.get(/^\/subs\/archive\/?$/, (_req: unknown, res: Response) => {
      res.sendFile(path.join(archivePage, 'index.html'));
    });
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  }
}

void bootstrap();
