/**
 * Pure helpers ported from threads-poster/publish.py:
 * split_into_posts, pack_chunks, normalize_topic_tag, parse_poll_options.
 */

export const LIMIT_CHARS = 500;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const POLL_OPTION_MAX_BYTES = 25;
export const POLL_KEYS = ['option_a', 'option_b', 'option_c', 'option_d'] as const;
export const MAX_IMAGES = 20;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);
export const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png']);

const SENTENCE_SPLIT = /(?<=[.!?…])\s+/;
const TOPIC_FORBIDDEN = /[.&\s]/;

export class ThreadsTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreadsTextError';
  }
}

export function charLen(text: string): number {
  return text.length;
}

export function packChunks(
  parts: string[],
  limit: number,
  joiner: string,
): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    const candidate = current ? `${current}${joiner}${piece}` : piece;
    if (charLen(candidate) <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (charLen(piece) <= limit) {
      current = piece;
    } else {
      chunks.push(...splitOverlong(piece, limit));
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitByChars(text: string, limit: number): string[] {
  if (!text) return [''];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    parts.push(text.slice(i, i + limit));
  }
  return parts;
}

function splitOverlong(text: string, limit: number): string[] {
  if (charLen(text) <= limit) return [text];
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    const packed = packChunks(lines, limit, '\n');
    if (packed.length && Math.max(...packed.map(charLen)) <= limit) {
      return packed;
    }
  }
  const sentences = text
    .split(SENTENCE_SPLIT)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length > 1) {
    const packed = packChunks(sentences, limit, ' ');
    if (packed.length && Math.max(...packed.map(charLen)) <= limit) {
      return packed;
    }
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const packed = packChunks(words, limit, ' ');
    if (packed.length && Math.max(...packed.map(charLen)) <= limit) {
      return packed;
    }
  }
  return splitByChars(text, limit);
}

export function splitIntoPosts(
  text: string,
  limit: number = LIMIT_CHARS,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (charLen(trimmed) <= limit) return [trimmed];
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  return packChunks(paragraphs, limit, '\n\n');
}

const MIN_LIVE_TEXT_MATCH = 24;

export function compactThreadText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** True when a live Threads root post is the published first part of this draft. */
export function threadTextMatchesDraft(
  liveText: string,
  draftText: string,
): boolean {
  const firstPart = compactThreadText(
    splitIntoPosts(draftText)[0] || draftText,
  );
  const live = compactThreadText(liveText);
  if (
    firstPart.length < MIN_LIVE_TEXT_MATCH ||
    live.length < MIN_LIVE_TEXT_MATCH
  ) {
    return firstPart.length >= 12 && live === firstPart;
  }
  if (live === firstPart) return true;
  if (live.startsWith(firstPart) || firstPart.startsWith(live)) return true;
  const needle = firstPart.slice(0, Math.min(80, firstPart.length));
  return live.startsWith(needle);
}

export function normalizeTopicTag(raw: string): string {
  const tag = raw.trim().replace(/^#+/, '').trim();
  if (!tag) return '';
  if (tag.length > 50) {
    throw new ThreadsTextError('topic_tag must be 1–50 characters');
  }
  if (TOPIC_FORBIDDEN.test(tag)) {
    throw new ThreadsTextError(
      'topic_tag cannot contain spaces, periods, or ampersands',
    );
  }
  return tag;
}

export function parsePollOptions(raw: string | string[]): string[] {
  const options = (
    Array.isArray(raw) ? raw : raw.split('|')
  )
    .map((part) => part.trim())
    .filter(Boolean);
  if (!options.length) return [];
  if (
    options.length < POLL_MIN_OPTIONS ||
    options.length > POLL_MAX_OPTIONS
  ) {
    throw new ThreadsTextError(
      `poll needs ${POLL_MIN_OPTIONS}–${POLL_MAX_OPTIONS} options`,
    );
  }
  for (const option of options) {
    if (Buffer.byteLength(option, 'utf8') > POLL_OPTION_MAX_BYTES) {
      throw new ThreadsTextError(
        `poll option longer than ${POLL_OPTION_MAX_BYTES} UTF-8 bytes: ${option}`,
      );
    }
  }
  return options;
}

export function pollAttachmentJson(options: string[]): string {
  const payload: Record<string, string> = {};
  options.forEach((option, index) => {
    payload[POLL_KEYS[index]] = option;
  });
  return JSON.stringify(payload);
}

export function pollDiaryLine(options: string[]): string {
  return 'Опрос: ' + options.join(' · ');
}

export function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function mimeForFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

export function extForMime(mimeType: string): string {
  if (mimeType === 'image/png') return '.png';
  return '.jpg';
}
