// Anonymous web operations verified on 21 October 2026. These are not the
// authenticated Graph API. A schema change must fail visibly, not erase posts.
const OPERATIONS = [
  ['BarcelonaProfileThreadsTabDirectQuery', '28993503350335988'],
  ['BarcelonaProfileThreadsTabRefetchableDirectQuery', '29040497112211018'],
] as const;

export class ThreadsProfileError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function normalizeThreadsProfile(input: unknown): string {
  if (typeof input !== 'string' || input.length > 250)
    throw new ThreadsProfileError('INVALID_PROFILE');
  let username = input.trim();
  if (/^https:\/\//i.test(username)) {
    let url: URL;
    try {
      url = new URL(username);
    } catch {
      throw new ThreadsProfileError('INVALID_PROFILE');
    }
    if (
      ![
        'threads.com',
        'www.threads.com',
        'threads.net',
        'www.threads.net',
      ].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/@[\w.]+\/?$/.test(url.pathname)
    )
      throw new ThreadsProfileError('INVALID_PROFILE');
    username = url.pathname.replace(/^\/@|\/$/g, '');
  } else username = username.replace(/^@/, '');
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.]{0,29}$/.test(username))
    throw new ThreadsProfileError('INVALID_PROFILE');
  return username.toLowerCase();
}

export type ProfilePost = {
  remoteId: string;
  text: string;
  url: string;
  publishedAt: Date;
  likes: number | null;
};
export type ProfileSnapshot = {
  displayName: string;
  posts: ProfilePost[];
  // Every collection is a bounded recent snapshot, not an archive of a profile.
  partial: boolean;
  limited: boolean;
};

type WebPost = {
  pk?: string;
  code?: string;
  caption?: { text?: string };
  user?: { username?: string; full_name?: string };
  taken_at?: number;
  like_count?: number;
};
type ProfileConnection = {
  edges?: { node?: { thread_items?: { post?: WebPost }[] } }[];
  page_info?: { has_next_page?: boolean; end_cursor?: string };
};

const GUEST_PROVIDERS: Record<string, boolean> = {
  __relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider: false,
  __relay_internal__pv__BarcelonaGenAIRepliesEnabledrelayprovider: false,
  __relay_internal__pv__BarcelonaHasBestOfThreadsrelayprovider: false,
  __relay_internal__pv__BarcelonaHasCommunitiesrelayprovider: false,
  __relay_internal__pv__BarcelonaHasCommunityEmojiUpdateCardrelayprovider: false,
  __relay_internal__pv__BarcelonaHasCommunityEntityCardrelayprovider: false,
  __relay_internal__pv__BarcelonaHasCommunityTopContributorsrelayprovider: false,
  __relay_internal__pv__BarcelonaHasCustomLikesConsumptionrelayprovider: false,
  __relay_internal__pv__BarcelonaHasDearAlgoConsumptionrelayprovider: false,
  __relay_internal__pv__BarcelonaHasDearAlgoWebProductionrelayprovider: false,
  __relay_internal__pv__BarcelonaHasEventBadgerelayprovider: false,
  __relay_internal__pv__BarcelonaHasGameScoreSharerelayprovider: false,
  __relay_internal__pv__BarcelonaHasGhostPostEmojiActivationrelayprovider: false,
  __relay_internal__pv__BarcelonaHasGhostPostProductionrelayprovider: false,
  __relay_internal__pv__BarcelonaHasMWRLocationConsumptionrelayprovider: false,
  __relay_internal__pv__BarcelonaHasMessagingrelayprovider: false,
  __relay_internal__pv__BarcelonaHasMetaAiContentAttachmentsrelayprovider: false,
  __relay_internal__pv__BarcelonaHasNewsletterLinkPreviewrelayprovider: false,
  __relay_internal__pv__BarcelonaHasNewspaperLinkStylerelayprovider: false,
  __relay_internal__pv__BarcelonaHasPodcastTranscriptConsumptionrelayprovider: false,
  __relay_internal__pv__BarcelonaHasPodcastV2Consumptionrelayprovider: false,
  __relay_internal__pv__BarcelonaHasPrivateRepliesDeprecationrelayprovider: false,
  __relay_internal__pv__BarcelonaHasProfileSelfReplyContextrelayprovider: false,
  __relay_internal__pv__BarcelonaHasPublicViewCountCardrelayprovider: false,
  __relay_internal__pv__BarcelonaHasPublicViewCountShareCardrelayprovider: false,
  __relay_internal__pv__BarcelonaHasScorecardCommunityrelayprovider: false,
  __relay_internal__pv__BarcelonaHasSportTeamAllegianceCardrelayprovider: false,
  __relay_internal__pv__BarcelonaHasStitchedAttachmentrelayprovider: false,
  __relay_internal__pv__BarcelonaHasUnseenRepliesrelayprovider: false,
  __relay_internal__pv__BarcelonaHasViewerRepliedrelayprovider: false,
  __relay_internal__pv__BarcelonaHasWebFaviconsrelayprovider: false,
  __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
  __relay_internal__pv__BarcelonaIsInternalUserrelayprovider: false,
  __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: false,
  __relay_internal__pv__BarcelonaIsLoggedOutShareTestEnabledrelayprovider: false,
  __relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider: false,
  __relay_internal__pv__BarcelonaMessagesHasLiveChatMessagingrelayprovider: false,
  __relay_internal__pv__BarcelonaMessagingHasMetaAIBotrelayprovider: false,
  __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: false,
  __relay_internal__pv__BarcelonaShouldFetchPostAuthorFullNamerelayprovider: false,
  __relay_internal__pv__BarcelonaShouldFulfillLightboxQueryrelayprovider: false,
  __relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider: false,
};

async function readResponse(
  response: Response,
  limit: number,
): Promise<string> {
  if (!response.ok) throw new ThreadsProfileError(`HTTP_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new ThreadsProfileError('EMPTY_RESPONSE');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new ThreadsProfileError('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function request(url: string, init: RequestInit, limit: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readResponse(
        await fetch(url, {
          ...init,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        }),
        limit,
      );
    } catch (error) {
      const code =
        error instanceof ThreadsProfileError
          ? error.code
          : (error as { cause?: { code?: string }; name?: string })?.cause
              ?.code ||
            ((error as Error)?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
      const transient =
        /^(HTTP_429|HTTP_5\d\d|TIMEOUT|NETWORK|EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT)$/.test(
          code,
        );
      if (!attempt && transient) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        continue;
      }
      throw new ThreadsProfileError(
        transient ? (code.startsWith('HTTP_') ? code : 'NETWORK') : code,
      );
    }
  }
}

export async function fetchThreadsProfile(
  input: string,
): Promise<ProfileSnapshot> {
  const username = normalizeThreadsProfile(input);
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const html = await request(
    `https://www.threads.com/@${username}`,
    { headers },
    2_000_000,
  );
  const userID = /"user_id":"(\d+)"/.exec(html)?.[1];
  const lsd = /\["LSD",\[\],\{"token":"([^"]+)"/.exec(html)?.[1];
  if (!userID || !lsd) throw new ThreadsProfileError('PROFILE_UNAVAILABLE');
  const posts = new Map<string, ProfilePost>();
  let displayName = username;
  let after: string | null = null;
  let partial = false;
  let limited = false;
  const cursors = new Set<string>();
  for (let page = 0; page < 3; page++) {
    try {
      const [name, id] = OPERATIONS[page ? 1 : 0];
      const body = new URLSearchParams({
        lsd,
        __a: '1',
        __user: '0',
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: name,
        doc_id: id,
        variables: JSON.stringify({
          ...GUEST_PROVIDERS,
          userID,
          first: 4,
          last: null,
          after,
          before: null,
          allow_page_info_for_lox_user: true,
        }),
      });
      const text = await request(
        'https://www.threads.com/api/graphql',
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-LSD': lsd,
          },
          body,
        },
        8_000_000,
      );
      let payload;
      try {
        payload = JSON.parse(text.replace(/^for \(;;\);/, ''));
      } catch {
        throw new ThreadsProfileError('SCHEMA_CHANGED');
      }
      const connection = payload.data?.mediaData as
        | ProfileConnection
        | undefined;
      if (!Array.isArray(connection?.edges))
        throw new ThreadsProfileError('SCHEMA_CHANGED');
      for (const edge of connection.edges) {
        if (!Array.isArray(edge.node?.thread_items)) {
          partial = true;
          continue;
        }
        // Only actual items in this author's threads. Never recurse into quotes.
        for (const { post } of edge.node.thread_items) {
          if (!post || post.user?.username?.toLowerCase() !== username)
            continue;
          const stamp = new Date((post.taken_at || 0) * 1000);
          if (
            !/^\d+$/.test(post.pk || '') ||
            !/^[A-Za-z0-9_-]+$/.test(post.code || '') ||
            !post.taken_at ||
            Number.isNaN(stamp.getTime())
          ) {
            partial = true;
            continue;
          }
          displayName = post.user?.full_name?.slice(0, 200) || displayName;
          posts.set(post.pk!, {
            remoteId: post.pk!,
            text:
              typeof post.caption?.text === 'string' ? post.caption.text : '',
            url: `https://www.threads.com/@${username}/post/${post.code}`,
            publishedAt: stamp,
            likes:
              Number.isSafeInteger(post.like_count) &&
              post.like_count! >= 0 &&
              post.like_count! <= 2147483647
                ? post.like_count!
                : null,
          });
        }
      }
      if (payload.errors?.length) {
        if (!posts.size) throw new ThreadsProfileError('SCHEMA_CHANGED');
        partial = true;
        break;
      }
      const info = connection.page_info;
      if (!info || typeof info.has_next_page !== 'boolean') {
        partial = true;
        break;
      }
      if (!info.has_next_page) break;
      after = info.end_cursor || null;
      if (!after || cursors.has(after)) {
        partial = true;
        break;
      }
      cursors.add(after);
      if (page === 2) limited = true;
    } catch (error) {
      if (!posts.size) throw error;
      partial = true;
      break;
    }
  }
  return { displayName, posts: [...posts.values()], partial, limited };
}
