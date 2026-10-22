import {
  fetchThreadsProfile,
  normalizeThreadsProfile,
} from './threads-public-profile';

const html = '"user_id":"7" ["LSD",[],{"token":"anonymous"}]';
const post = (id: string, username = 'author') => ({
  pk: id,
  code: `code${id}`,
  user: { username, full_name: 'An Author' },
  caption: { text: 'Public text' },
  taken_at: 1792603181,
  like_count: 4,
});
const page = (posts: ReturnType<typeof post>[], cursor?: string) => ({
  data: {
    mediaData: {
      edges: posts.map((p) => ({ node: { thread_items: [{ post: p }] } })),
      page_info: { has_next_page: Boolean(cursor), end_cursor: cursor ?? null },
    },
  },
});

describe('Public Threads profiles', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    '@Author',
    'author',
    'https://threads.net/@Author/?tracking=x',
    'https://www.threads.com/@author',
  ])('normalizes %s', (input) =>
    expect(normalizeThreadsProfile(input)).toBe('author'),
  );
  it.each([
    'https://www.threads.com.evil.test/@author',
    'https://www.threads.com@localhost/@author',
    'https://www.threads.com:8443/@author',
    'https://www.threads.com/@author/post/abc',
    'http://www.threads.com/@author',
    '../author',
    '@a/b',
  ])('rejects arbitrary fetch targets: %s', (input) =>
    expect(() => normalizeThreadsProfile(input)).toThrow('INVALID_PROFILE'),
  );

  it('paginates and deduplicates, excluding quotes and other authors', async () => {
    const first = page([post('10')], 'next');
    Object.assign(first.data.mediaData.edges[0].node.thread_items[0].post, {
      text_post_app_info: { quoted_post: post('99', 'stranger') },
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(
        Response.json(page([post('10'), post('11'), post('12', 'stranger')])),
      );
    const result = await fetchThreadsProfile('@Author');
    expect(result.displayName).toBe('An Author');
    expect(result.posts.map((p) => p.remoteId)).toEqual(['10', '11']);
    expect(result.partial).toBe(false);
    const init = fetchMock.mock.calls[2][1]!;
    const vars = JSON.parse(
      new URLSearchParams(String(init.body)).get('variables')!,
    );
    expect(vars.after).toBe('next');
    expect(vars.__relay_internal__pv__BarcelonaIsLoggedInrelayprovider).toBe(
      false,
    );
    expect(init.headers).not.toHaveProperty('Cookie');
    expect(result.posts[0]).not.toHaveProperty('text_post_app_info');
  });
  it('keeps collected posts if a later page fails', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(Response.json(page([post('10')], 'next')))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    expect(await fetchThreadsProfile('author')).toMatchObject({
      partial: true,
      posts: [{ remoteId: '10' }],
    });
  });
  it('does not silently accept a changed response schema', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(
        Response.json({ data: null, errors: [{ code: 1 }] }),
      );
    await expect(fetchThreadsProfile('author')).rejects.toThrow(
      'SCHEMA_CHANGED',
    );
  });
  it('bounds collection and marks stalled cursors partial', async () => {
    const mock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(html))
      .mockImplementation(async () =>
        Response.json(page([post('10')], 'same')),
      );
    expect((await fetchThreadsProfile('author')).partial).toBe(true);
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it('distinguishes the normal snapshot limit from an upstream failure', async () => {
    let number = 0;
    const mock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(html))
      .mockImplementation(async () =>
        Response.json(page([post(String(++number))], `cursor-${number}`)),
      );
    expect(await fetchThreadsProfile('author')).toMatchObject({
      partial: false,
      limited: true,
    });
    expect(mock).toHaveBeenCalledTimes(4);
  });
  it('does not mark an empty error response as a successful empty profile', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(
        Response.json({ ...page([]), errors: [{ code: 1 }] }),
      );
    await expect(fetchThreadsProfile('author')).rejects.toThrow(
      'SCHEMA_CHANGED',
    );
  });
  it('retries a transient HTTP failure once', async () => {
    const mock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(Response.json(page([post('10')])));
    expect((await fetchThreadsProfile('author')).posts).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it('rejects a login page, without issuing GraphQL requests', async () => {
    const mock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Log in'));
    await expect(fetchThreadsProfile('author')).rejects.toThrow(
      'PROFILE_UNAVAILABLE',
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
