/**
 * Build the searchable diary-note block from everything we know about a
 * video (caption, transcript, on-screen description). Kept pure so the
 * merge is unit-tested without Prisma.
 *
 * The block is wrapped in a stable heading so a later backfill can replace
 * just the generated part and leave the user's own diary text above it.
 */
export const VIDEO_INDEX_HEADING = '---\nВидео';

export const DIARY_DUPLICATE_THRESHOLD = 0.75;

export type ReelDiaryFields = {
  title?: string | null;
  description?: string | null;
  instagramUrl?: string | null;
  shortcode?: string | null;
  tags?: string[] | null;
  transcriptClean?: string | null;
  transcript?: string | null;
  visionDescription?: string | null;
};

export function formatVideoIndex(reel: ReelDiaryFields): string {
  const isDiaryProxy = (reel.shortcode || '').startsWith('diary-v');
  const transcript = (reel.transcriptClean || reel.transcript || '').trim();
  const vision = (reel.visionDescription || '').trim();
  const title = (reel.title || '').trim();
  const description = (reel.description || '').trim();
  const tags = (reel.tags || []).map((tag) => tag.trim()).filter(Boolean);
  const instagramUrl =
    !isDiaryProxy && (reel.instagramUrl || '').trim()
      ? reel.instagramUrl!.trim()
      : '';

  const parts: string[] = [];
  if (title) parts.push(title);
  if (description && description !== title) parts.push(description);
  if (instagramUrl) parts.push(instagramUrl);
  if (tags.length) parts.push(`Теги: ${tags.join(', ')}`);
  if (transcript) parts.push(`Расшифровка:\n${transcript}`);
  if (vision) parts.push(`Что на экране:\n${vision}`);
  return parts.join('\n\n').trim();
}

export function mergeNoteWithVideoIndex(
  existing: string | null | undefined,
  index: string,
): string {
  const block = index.trim();
  if (!block) return (existing || '').trim();

  const userText = stripVideoIndex(existing);
  if (!userText || isRedundantUserText(userText, block)) {
    return `${VIDEO_INDEX_HEADING}\n\n${block}`;
  }
  return `${userText}\n\n${VIDEO_INDEX_HEADING}\n\n${block}`;
}

export function stripVideoIndex(existing: string | null | undefined): string {
  const text = (existing || '').trim();
  if (!text) return '';
  if (
    text === VIDEO_INDEX_HEADING ||
    text.startsWith(`${VIDEO_INDEX_HEADING}\n`)
  ) {
    return '';
  }
  const idx = text.indexOf(`\n${VIDEO_INDEX_HEADING}`);
  if (idx === -1) return text;
  return text.slice(0, idx).trim();
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isRedundantUserText(userText: string, index: string): boolean {
  const user = normalize(userText);
  const body = normalize(index);
  if (!user) return true;
  if (body.includes(user)) return true;
  const lines = userText
    .split(/\n+/)
    .map((line) => normalize(line))
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => body.includes(line));
}
