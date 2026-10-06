import { ThreadsWatchService } from './threads-watch.service';

describe('ThreadsWatchService isolation and persistence', () => {
  const posts = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  };
  const service = new ThreadsWatchService({ threadsPost: posts } as never);
  beforeEach(() => jest.clearAllMocks());

  it('deduplicates canonical URL aliases using the existing unique key', async () => {
    posts.upsert.mockResolvedValue({ id: 7 });
    await service.add('https://threads.net/@person/post/abc?tracking=1');
    expect(posts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { canvasId: 'watch:abc' },
        update: {},
        create: expect.objectContaining({
          destination: 'watch',
          source: 'watch',
        }),
      }),
    );
  });
  it('only lists watched posts', () => {
    service.list();
    expect(posts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { destination: 'watch' } }),
    );
  });
  it('cannot delete or refresh a composer post', async () => {
    posts.findUnique.mockResolvedValue({ id: 1, destination: 'threads' });
    await expect(service.remove(1)).rejects.toThrow('Watched post not found');
    await expect(service.refresh(1)).rejects.toThrow('Watched post not found');
    expect(posts.delete).not.toHaveBeenCalled();
    expect(posts.update).not.toHaveBeenCalled();
  });
  it('keeps old stats when the remote post is unavailable', async () => {
    posts.findUnique.mockResolvedValue({
      id: 7,
      destination: 'watch',
      url: 'https://www.threads.com/@person/post/abc',
      stats: { likes: 10 },
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Sign in', { status: 200 }));
    try {
      await expect(service.refresh(7)).rejects.toThrow(
        'Saved data has been kept',
      );
      expect(posts.update).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('stores a successful snapshot and preserves the previous counts', async () => {
    posts.findUnique.mockResolvedValue({
      id: 7,
      destination: 'watch',
      url: 'https://www.threads.com/@person/post/abc',
      text: 'Old text',
      stats: { likes: 9 },
    });
    const html =
      '<span class="BodyTextContainer">New text</span><div class="PostDateContainer"></div><div class="ActionBarContainer">' +
      [10, 66, 0, 6]
        .map(
          (count) =>
            `<span class="ActionBarIcon"><svg></svg><span class="ActionBarCount">${count}</span></span>`,
        )
        .join('') +
      '</div>';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(html, { status: 200 }));
    try {
      await service.refresh(7);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.threads.com/@person/post/abc/embed',
        expect.objectContaining({ redirect: 'error' }),
      );
      expect(posts.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          data: expect.objectContaining({
            text: 'New text',
            statsPrev: { likes: 9 },
            stats: expect.objectContaining({
              likes: 10,
              replies: 66,
              reposts: 0,
              shares: 6,
            }),
          }),
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});
