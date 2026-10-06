export const WATCH_DESTINATION = 'watch';

export function normalizeWatchUrl(input: unknown) {
  if (typeof input !== 'string') throw new Error('Invalid Threads URL');
  const url = new URL(input.trim());
  if (
    url.protocol !== 'https:' ||
    ![
      'threads.net',
      'www.threads.net',
      'threads.com',
      'www.threads.com',
    ].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('Invalid Threads URL');
  const match = /^\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)\/?$/.exec(
    url.pathname,
  );
  if (!match) throw new Error('Invalid Threads URL');
  return {
    url: `https://www.threads.com/@${match[1]}/post/${match[2]}`,
    username: match[1],
    code: match[2],
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/&#(x[\da-f]+|\d+);/gi, (entity, raw: string) => {
      const code =
        raw[0].toLowerCase() === 'x' ? parseInt(raw.slice(1), 16) : Number(raw);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function plainText(html: string) {
  return decodeHtml(
    html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ''),
  ).trim();
}

export type WatchStats = {
  likes?: number;
  replies?: number;
  reposts?: number;
  shares?: number;
  approximate: string[];
  updated: string;
  dateLabel?: string;
};

// Public /embed HTML exposes four action counters in this order. Never parse
// unrelated page JSON or treat a missing/hidden count as zero.
export function parseWatchEmbed(html: string) {
  const body = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const text =
    /class="[^"]*\bBodyTextContainer\b[^"]*"[^>]*>([\s\S]*?)(?=<div\b|<\/div>)/.exec(
      body,
    );
  const date = /class="Timestamp"[^>]*>([\s\S]*?)<\/span>/.exec(body);
  const bar = /class="ActionBarContainer"[^>]*>([\s\S]*?)<\/div>/.exec(body);
  if (!text && !bar) throw new Error('Public post is unavailable');
  const stats: WatchStats = {
    approximate: [],
    updated: new Date().toISOString(),
  };
  const keys = ['likes', 'replies', 'reposts', 'shares'] as const;
  const actions =
    bar?.[1].split(/<span\b[^>]*class="ActionBarIcon"[^>]*>/).slice(1) || [];
  if (actions.length === keys.length) {
    actions.forEach((action, index) => {
      const count = /class="ActionBarCount"[^>]*>([^<]*)<\/span>/.exec(action);
      if (!count) return;
      const raw = plainText(count[1]).replace(/,/g, '').replace(/\s/g, '');
      const match = /^(\d+(?:\.\d+)?)([KMB])?$/i.exec(raw);
      if (!match) return;
      const scale = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
      stats[keys[index]] = Math.round(
        Number(match[1]) * (scale[match[2]?.toUpperCase()] || 1),
      );
      if (match[2]) stats.approximate.push(keys[index]);
    });
  }
  if (date) stats.dateLabel = plainText(date[1]);
  return { text: text ? plainText(text[1]) : '', stats };
}
