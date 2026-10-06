import { normalizeWatchUrl } from './threads-watch-parser';

// The anonymous web queries currently used by Threads (October 2026).
// This is a public web interface, not the owner-only Graph Insights API.
const QUERIES = {
  initial: { name: 'BarcelonaPostPageDownwardQuery', id: '28648652251458301' },
  page: {
    name: 'BarcelonaPostPageDirectRepliesRefetchQuery',
    id: '38822170957427430',
  },
};
const PROVIDERS =
  `HasBestOfThreads HasDearAlgoConsumption HasMetaAiContentAttachments
ShouldFetchPostAuthorFullName IsLoggedIn MessagesHasLiveChatMessaging HasEventBadge
MessagingHasMetaAIBot GenAIRepliesEnabled IsSearchDiscoveryEnabled HasCommunities
HasGameScoreShare HasPublicViewCountCard HasCommunityEmojiUpdateCard HasCommunityEntityCard
HasScorecardCommunity HasSportTeamAllegianceCard HasMusic HasNewspaperLinkStyle HasMessaging
HasPodcastV2Consumption HasPodcastTranscriptConsumption OptionalCookiesEnabled
ShouldFulfillLightboxQuery CanSeeSponsoredContent HasWebFavicons IsCrawler
HasDearAlgoWebProduction HasCommunityTopContributors HasCustomLikesConsumption HasViewerReplied
HasPrivateRepliesDeprecation HasGhostPostEmojiActivation ShouldShowFediverseM075Features
IsInternalUser HasPermalinkIndentation`
    .trim()
    .split(/\s+/);
const guestVariables = Object.fromEntries(
  PROVIDERS.map((name) => [
    `__relay_internal__pv__Barcelona${name}relayprovider`,
    false,
  ]),
);

export type PublicReply = {
  id: string;
  parentId: string;
  username: string;
  text: string;
  url: string;
  timestamp?: string;
  likes?: number;
  replyCount: number;
};
export type PublicRepliesDump = {
  rootId: string;
  replies: PublicReply[];
  freshIds: string[];
  updated: string;
  complete: boolean;
  unavailable: boolean;
  sync: 'running' | 'complete' | 'partial' | 'failed';
  checked: number;
  queued: number;
};

type Post = {
  pk?: string;
  code?: string;
  user?: { username?: string };
  caption?: { text?: string };
  taken_at?: number;
  like_count?: number;
  text_post_app_info?: { direct_reply_count?: number };
};
type Connection<T> = {
  edges?: { node?: T }[];
  page_info?: { end_cursor?: string; has_next_page?: boolean };
};
type Thread = { posts?: Connection<Post> };
type ReplyInfo = {
  direct_replies?: Connection<Thread>;
  self_thread?: Thread;
  pinned_replies?: Connection<Thread>;
  has_unavailable_replies?: boolean;
};

export function publicReply(post: Post, parentId: string): PublicReply | null {
  if (
    !post.pk ||
    !/^\d+$/.test(post.pk) ||
    !/^[A-Za-z0-9._]+$/.test(post.user?.username || '') ||
    !/^[A-Za-z0-9_-]+$/.test(post.code || '')
  )
    return null;
  const reply: PublicReply = {
    id: post.pk,
    parentId,
    username: post.user!.username!,
    text: typeof post.caption?.text === 'string' ? post.caption.text : '',
    url: `https://www.threads.com/@${post.user!.username}/post/${post.code}`,
    replyCount:
      typeof post.text_post_app_info?.direct_reply_count === 'number'
        ? post.text_post_app_info.direct_reply_count
        : 0,
  };
  if (typeof post.like_count === 'number') reply.likes = post.like_count;
  if (typeof post.taken_at === 'number') {
    const date = new Date(post.taken_at * 1000);
    if (!Number.isNaN(date.getTime())) reply.timestamp = date.toISOString();
  }
  return reply;
}

async function responseText(response: Response, maxBytes: number) {
  if (!response.ok) throw new Error('Threads response unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Threads response empty');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) throw new Error('Threads response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchPublicReplies(
  input: string,
  progress: (dump: PublicRepliesDump) => Promise<void>,
): Promise<PublicRepliesDump> {
  const link = normalizeWatchUrl(input);
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const html = await responseText(
    await fetch(link.url, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    }),
    2_000_000,
  );
  const rootId = /"post_id":"(\d+)"/.exec(html)?.[1];
  const lsd = /\["LSD",\[\],\{"token":"([^"]+)"/.exec(html)?.[1];
  if (!rootId || !lsd) throw new Error('Public replies unavailable');
  let requests = 0;
  const startedAt = Date.now();
  const dump: PublicRepliesDump = {
    rootId,
    replies: [],
    freshIds: [],
    updated: new Date().toISOString(),
    complete: false,
    unavailable: false,
    sync: 'running',
    checked: 0,
    queued: 1,
  };
  const replies = new Map<string, PublicReply>();
  const queue = [rootId];
  const scheduled = new Set(queue);
  const query = async (
    kind: keyof typeof QUERIES,
    postID: string,
    after?: string,
  ) => {
    // No depth limit. Resource/time limits produce an explicitly partial dump.
    if (++requests > 2000 || Date.now() - startedAt > 30 * 60_000)
      throw new Error('Reply collection limit');
    const operation = QUERIES[kind];
    const variables = {
      ...guestVariables,
      postID,
      sortOrder: 'RECENT',
      ...(kind === 'page'
        ? { first: 50, after: after || null, filterType: null }
        : {}),
    };
    const body = new URLSearchParams({
      lsd,
      __a: '1',
      __user: '0',
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: operation.name,
      doc_id: operation.id,
      variables: JSON.stringify(variables),
    });
    const text = await responseText(
      await fetch('https://www.threads.com/api/graphql', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-FB-LSD': lsd,
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      }),
      10_000_000,
    );
    const payload = JSON.parse(text.replace(/^for \(;;\);/, ''));
    const info = payload.data?.media?.text_post_app_info as
      | ReplyInfo
      | undefined;
    if (payload.errors?.length || !info?.direct_replies)
      throw new Error('Public replies unavailable');
    dump.unavailable ||= Boolean(info.has_unavailable_replies);
    return info;
  };
  const add = (post: Post | undefined, parentId: string) => {
    if (!post || post.pk === rootId || post.pk === parentId) return;
    const reply = publicReply(post, parentId);
    if (!reply) {
      dump.unavailable = true;
      return;
    }
    replies.set(reply.id, reply);
    if (reply.replyCount > 0 && !scheduled.has(reply.id)) {
      scheduled.add(reply.id);
      queue.push(reply.id);
    }
  };
  const snapshot = async () => {
    dump.replies = [...replies.values()];
    dump.queued = queue.length;
    await progress({ ...dump, replies: [...dump.replies] });
  };
  try {
    const initial = await query('initial', rootId);
    for (const edge of initial.self_thread?.posts?.edges || [])
      add(edge.node, rootId);
    for (const edge of initial.pinned_replies?.edges || [])
      add(edge.node?.posts?.edges?.[0]?.node, rootId);
    while (queue.length) {
      const parentId = queue.shift()!;
      let after: string | undefined;
      const cursors = new Set<string>();
      do {
        const info = await query('page', parentId, after);
        for (const edge of info.direct_replies!.edges || []) {
          // Additional posts in each preview can skip hierarchy levels. Fetch
          // each parent's own replies instead of assigning guessed parents.
          add(edge.node?.posts?.edges?.[0]?.node, parentId);
        }
        const page = info.direct_replies!.page_info;
        after = page?.has_next_page ? page.end_cursor : undefined;
        if (page?.has_next_page && (!after || cursors.has(after)))
          throw new Error('Reply pagination stalled');
        if (after) cursors.add(after);
        await snapshot();
      } while (after);
      dump.checked += 1;
    }
    dump.complete = !dump.unavailable;
    dump.sync = dump.complete ? 'complete' : 'partial';
  } catch {
    dump.sync = replies.size ? 'partial' : 'failed';
  }
  dump.updated = new Date().toISOString();
  await snapshot();
  return dump;
}
