import { PrismaService } from '../prisma/prisma.service';
import { ThreadsNewsService } from './threads-news.service';
import * as profiles from './threads-public-profile';

// Opt-in isolated DB integration: never use POSTGRES_CONNECTION_STRING here.
const testUrl = process.env.THREADS_NEWS_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55438' ||
    url.pathname !== '/threads_news_test'
  )
    throw new Error('Threads news tests require the isolated local database');
}
const integration = testUrl ? describe : describe.skip;
integration('Threads news persistence', () => {
  let prisma: PrismaService;
  let service: ThreadsNewsService;
  const snapshot = {
    displayName: 'Author',
    limited: false,
    partial: false,
    posts: [
      {
        remoteId: '101',
        text: 'News',
        url: 'https://www.threads.com/@author/post/code101',
        publishedAt: new Date('2026-10-21T12:00:00Z'),
        likes: 2,
      },
    ],
  };
  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: testUrl } } });
    await prisma.$connect();
    service = new ThreadsNewsService(prisma);
  });
  beforeEach(async () => {
    await prisma.threadsNewsSource.deleteMany();
    await prisma.threadsNewsTranslationQuota.deleteMany();
    jest.spyOn(profiles, 'fetchThreadsProfile').mockResolvedValue(snapshot);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await prisma.threadsNewsSource.deleteMany();
    await prisma.threadsNewsTranslationQuota.deleteMany();
    await prisma.$disconnect();
  });

  it('adds a profile, deduplicates aliases and posts, and counts only new IDs', async () => {
    const first = await service.add({
      profile: '@Author',
      topics: ['AI', 'AI'],
    });
    expect(first).toMatchObject({
      username: 'author',
      topics: ['AI'],
      lastNewCount: 1,
      syncStatus: 'ok',
    });
    expect(
      (await service.add({ profile: 'https://threads.net/@author/' })).id,
    ).toBe(first.id);
    expect(profiles.fetchThreadsProfile).toHaveBeenCalledTimes(1);
    expect((await service.refresh(first.id)).lastNewCount).toBe(0);
    expect(await prisma.threadsNewsPost.count()).toBe(1);
  });
  it('preserves posts and the last successful timestamp on network failure', async () => {
    const source = await service.add({ profile: 'author' });
    jest
      .mocked(profiles.fetchThreadsProfile)
      .mockRejectedValue(new profiles.ThreadsProfileError('NETWORK'));
    const failed = await service.refresh(source.id);
    expect(failed).toMatchObject({
      syncStatus: 'failed',
      lastError: 'NETWORK',
      lastSuccessAt: source.lastSuccessAt,
    });
    expect(await prisma.threadsNewsPost.count()).toBe(1);
  });
  it('merges a partial snapshot without deleting older posts', async () => {
    const source = await service.add({ profile: 'author' });
    jest.mocked(profiles.fetchThreadsProfile).mockResolvedValue({
      ...snapshot,
      partial: true,
      posts: [{ ...snapshot.posts[0], remoteId: '102' }],
    });
    expect(await service.refresh(source.id)).toMatchObject({
      syncStatus: 'partial',
      lastNewCount: 1,
    });
    expect(await prisma.threadsNewsPost.count()).toBe(2);
  });
  it('protects paused sources and concurrent refreshes', async () => {
    const source = await service.add({ profile: 'author' });
    await service.update(source.id, { enabled: false });
    await expect(service.refresh(source.id)).rejects.toThrow('SOURCE_PAUSED');
    await service.update(source.id, { enabled: true });
    let resolve!: (value: profiles.ProfileSnapshot) => void;
    jest.mocked(profiles.fetchThreadsProfile).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const first = service.refresh(source.id);
    // Wait until the first worker holds the database lease and starts fetching.
    for (let i = 0; i < 100 && !resolve; i++)
      await new Promise((r) => setTimeout(r, 10));
    await expect(service.refresh(source.id)).rejects.toThrow('ALREADY_RUNNING');
    resolve(snapshot);
    await first;
  });
  it('reports and recovers an interrupted collection', async () => {
    const source = await service.add({ profile: 'author' });
    await prisma.threadsNewsSource.update({
      where: { id: source.id },
      data: {
        syncStatus: 'running',
        lastAttemptAt: new Date(Date.now() - 6 * 60_000),
      },
    });
    expect((await service.dashboard()).sources[0]).toMatchObject({
      syncStatus: 'failed',
      lastError: 'INTERRUPTED',
    });
    expect((await service.refresh(source.id)).syncStatus).toBe('ok');
  });
  it('validates filters and topic edits and filters the inbox', async () => {
    const source = await service.add({ profile: 'author' });
    expect((await service.posts(source.id)).total).toBe(1);
    expect((await service.posts(source.id + 100)).total).toBe(0);
    await expect(service.posts(undefined, -1)).rejects.toThrow(
      'INVALID_FILTER',
    );
    await expect(
      service.update(source.id, { topics: ['a'.repeat(41)] }),
    ).rejects.toThrow('INVALID_TOPICS');
    expect(
      (await service.update(source.id, { topics: ['AI', 'Dev'] })).topics,
    ).toEqual(['AI', 'Dev']);
  });
  it('removes a source and its saved posts', async () => {
    const source = await service.add({ profile: 'author' });
    await service.remove(source.id);
    expect(await prisma.threadsNewsSource.count()).toBe(0);
    expect(await prisma.threadsNewsPost.count()).toBe(0);
  });
  it('caches translations, skips Russian originals, and invalidates edited text', async () => {
    const source = await service.add({ profile: 'author' });
    const post = await prisma.threadsNewsPost.findFirstOrThrow();
    const oldKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  russian: false,
                  translation: 'Новости',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    try {
      expect(await service.translate(post.id)).toEqual({
        translationRu: 'Новости',
      });
      expect(await service.translate(post.id)).toEqual({
        translationRu: 'Новости',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      jest.mocked(profiles.fetchThreadsProfile).mockResolvedValue({
        ...snapshot,
        posts: [{ ...snapshot.posts[0], text: 'Updated news' }],
      });
      await service.refresh(source.id);
      expect(
        await prisma.threadsNewsPost.findUniqueOrThrow({
          where: { id: post.id },
        }),
      ).toMatchObject({ translationRu: null, translationCheckedAt: null });
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ russian: true, translation: null }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
      expect(await service.translate(post.id)).toEqual({
        translationRu: null,
      });
      expect(
        (
          await prisma.threadsNewsPost.findUniqueOrThrow({
            where: { id: post.id },
          })
        ).translationCheckedAt,
      ).not.toBeNull();
    } finally {
      if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldKey;
    }
  });
  it('stops translation before an API call when the monthly quota is full', async () => {
    await service.add({ profile: 'author' });
    const post = await prisma.threadsNewsPost.findFirstOrThrow();
    const month = new Date().toISOString().slice(0, 7);
    await prisma.threadsNewsTranslationQuota.create({
      data: { month, used: 100 },
    });
    const oldKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = jest.spyOn(global, 'fetch');
    try {
      await expect(service.translate(post.id)).rejects.toThrow(
        'TRANSLATION_LIMIT',
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        (
          await prisma.threadsNewsPost.findUniqueOrThrow({
            where: { id: post.id },
          })
        ).translationStartedAt,
      ).toBeNull();
    } finally {
      if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldKey;
    }
  });
  it('does not spend a translation request on a link-only post', async () => {
    jest.mocked(profiles.fetchThreadsProfile).mockResolvedValue({
      ...snapshot,
      posts: [
        {
          ...snapshot.posts[0],
          text: '👇 https://example.com/article',
        },
      ],
    });
    await service.add({ profile: 'author' });
    const post = await prisma.threadsNewsPost.findFirstOrThrow();
    const fetchMock = jest.spyOn(global, 'fetch');
    expect(await service.translate(post.id)).toEqual({ translationRu: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (
        await prisma.threadsNewsPost.findUniqueOrThrow({
          where: { id: post.id },
        })
      ).translationCheckedAt,
    ).not.toBeNull();
  });
});
