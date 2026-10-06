import { fetchPublicReplies, publicReply } from './threads-public-replies';

const link = 'https://www.threads.com/@owner/post/abc';
const html = '"post_id":"1" ["LSD",[],{"token":"guest-only"}]';
const post = (id: string, count = 0) => ({
  pk: id,
  code: `code${id}`,
  user: { username: 'person' },
  caption: { text: `Reply ${id}` },
  like_count: 3,
  text_post_app_info: { direct_reply_count: count },
});
const payload = (items: ReturnType<typeof post>[] = [], cursor?: string) => ({
  data: {
    media: {
      text_post_app_info: {
        direct_replies: {
          edges: items.map((item) => ({
            node: { posts: { edges: [{ node: item }] } },
          })),
          page_info: { has_next_page: Boolean(cursor), end_cursor: cursor },
        },
      },
    },
  },
});

describe('Public Threads reply traversal', () => {
  afterEach(() => jest.restoreAllMocks());
  it('loads every page and traverses beyond eight levels without copying account cookies', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_url, init) => {
        if (!init?.body) return new Response(html);
        const body = new URLSearchParams(String(init.body));
        const vars = JSON.parse(body.get('variables')!);
        expect(
          (init?.headers as Record<string, string>).Cookie,
        ).toBeUndefined();
        expect(
          vars.__relay_internal__pv__BarcelonaIsLoggedInrelayprovider,
        ).toBe(false);
        if (
          body.get('fb_api_req_friendly_name') ===
          'BarcelonaPostPageDownwardQuery'
        )
          return Response.json(payload());
        const id = Number(vars.postID);
        if (id === 1 && vars.after) return Response.json(payload([post('99')]));
        return Response.json(
          payload(
            id <= 9 ? [post(String(id + 1), id < 9 ? 1 : 0)] : [],
            id === 1 ? 'next-page' : undefined,
          ),
        );
      });
    const snapshots: number[] = [];
    const dump = await fetchPublicReplies(link, async (snapshot) => {
      snapshots.push(snapshot.replies.length);
    });
    expect(dump.sync).toBe('complete');
    expect(dump.replies.find((reply) => reply.id === '10')?.parentId).toBe('9');
    expect(dump.replies.find((reply) => reply.id === '99')?.parentId).toBe('1');
    expect(snapshots.length).toBeGreaterThan(8);
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });
  it('keeps collected replies and reports partial when a nested branch fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!init?.body) return new Response(html);
      const body = new URLSearchParams(String(init.body));
      const vars = JSON.parse(body.get('variables')!);
      if (
        body.get('fb_api_req_friendly_name') ===
        'BarcelonaPostPageDownwardQuery'
      )
        return Response.json(payload());
      if (vars.postID === '1') return Response.json(payload([post('2', 1)]));
      return Response.json({ errors: [{ message: 'Not available' }] });
    });
    const dump = await fetchPublicReplies(link, async () => {});
    expect(dump.sync).toBe('partial');
    expect(dump.complete).toBe(false);
    expect(dump.replies.map((reply) => reply.id)).toEqual(['2']);
  });
  it('only persists selected public fields and validated Threads URLs', () => {
    const result = publicReply(
      {
        ...post('2'),
        taken_at: 1700000000,
        private_reply_partner: 'discard',
        fetch_token: 'discard',
      } as never,
      '1',
    );
    expect(result).toMatchObject({
      id: '2',
      parentId: '1',
      url: 'https://www.threads.com/@person/post/code2',
      likes: 3,
    });
    expect(result).not.toHaveProperty('fetch_token');
    expect(result).not.toHaveProperty('private_reply_partner');
    expect(publicReply({ ...post('3'), code: 'x/../../evil' }, '1')).toBeNull();
  });
});
