import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import type { Request } from 'express';
import {
  ThreadsNewsApiController,
  ThreadsNewsPagesController,
} from './threads-news.controller';
import { ThreadsNewsService } from './services/threads-news.service';
import { AuthService } from './auth/auth.service';

describe('Threads news admin boundary', () => {
  let app: INestApplication;
  const news = {
    dashboard: jest.fn().mockResolvedValue({ sources: [], postCount: 0 }),
    add: jest.fn(),
    refresh: jest.fn(),
    update: jest.fn(),
    posts: jest.fn(),
    remove: jest.fn(),
    translate: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ThreadsNewsApiController, ThreadsNewsPagesController],
      providers: [
        { provide: ThreadsNewsService, useValue: news },
        {
          provide: AuthService,
          useValue: {
            enabled: true,
            getSessionFromRequest: (req: Request) =>
              req.headers['x-test-role']
                ? { email: req.headers['x-test-role'] }
                : null,
            isAdminUser: (user: { email: string } | null) =>
              user?.email === 'owner',
            safeRedirectPath: (url: string) => url,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app.close();
  });
  it('rejects unauthenticated API reads and writes', async () => {
    await request(app.getHttpServer())
      .get('/threads-news-api/dashboard')
      .expect(401);
    await request(app.getHttpServer())
      .post('/threads-news-api/sources')
      .send({ profile: '@someone' })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/threads-news-api/sources/1')
      .expect(401);
    await request(app.getHttpServer())
      .post('/threads-news-api/posts/1/translate')
      .expect(401);
    expect(news.add).not.toHaveBeenCalled();
    expect(news.remove).not.toHaveBeenCalled();
    expect(news.translate).not.toHaveBeenCalled();
  });
  it('rejects a signed-in non-owner', async () => {
    await request(app.getHttpServer())
      .get('/threads-news-api/dashboard')
      .set('x-test-role', 'member')
      .expect(403);
  });
  it.each([
    '/threads-news',
    '/threads-news/en',
    '/threads-news/index.html',
    '/threads-news/%69ndex.html',
  ])('guards the HTML entrypoint %s', async (path) => {
    const res = await request(app.getHttpServer())
      .get(path)
      .set('Accept', 'text/html')
      .expect(302);
    expect(res.headers.location).toMatch(/^\/auth\/google\?redirect=/);
  });
  it('serves the page, assets and API to the owner', async () => {
    await request(app.getHttpServer())
      .get('/threads-news')
      .set('x-test-role', 'owner')
      .expect(200)
      .expect('Content-Type', /html/);
    await request(app.getHttpServer())
      .get('/threads-news/styles.css')
      .set('x-test-role', 'owner')
      .expect(200)
      .expect('Content-Type', /css/);
    await request(app.getHttpServer())
      .get('/threads-news-api/dashboard')
      .set('x-test-role', 'owner')
      .expect(200, { sources: [], postCount: 0 });
  });
});
