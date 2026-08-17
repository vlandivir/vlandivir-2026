export const GTD_MAX_CONTEXT_CHARS = 200_000;
export const GTD_INDEX_CHARS = 24_000;
export const GTD_EMAIL_TITLE_MAX = 200;

export function isGtdTextMime(mime: string): boolean {
  return (
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime === 'text/x-markdown'
  );
}

export function sanitizeContextName(name?: unknown): string {
  if (typeof name !== 'string' || !name.trim()) return 'context.md';
  const base = name
    .trim()
    .replace(/[/\\]/g, '_')
    .replace(/[^\w.\p{L}\p{N} _-]+/gu, '_')
    .slice(0, 120)
    .trim();
  if (!base) return 'context.md';
  if (/\.(md|txt|markdown)$/i.test(base)) return base;
  return `${base}.md`;
}

export function contextMimeForName(name: string): string {
  return /\.txt$/i.test(name) ? 'text/plain' : 'text/markdown';
}

export type GtdIndexAttachment = {
  originalName: string;
  mimeType: string;
  description?: string | null;
  text?: string | null;
};

export function buildGtdIndexText(task: {
  content: string;
  status: string;
  dueDate?: Date | null;
  snoozedUntil?: Date | null;
  project?: { name: string } | null;
  attachments?: GtdIndexAttachment[];
}): string {
  const lines = [
    task.content.trim(),
    task.project?.name ? `проект: ${task.project.name}` : null,
    task.dueDate
      ? `срок: ${task.dueDate.toISOString().slice(0, 10)}`
      : null,
    task.snoozedUntil
      ? `отложено до: ${task.snoozedUntil.toISOString()}`
      : null,
    `статус: ${task.status}`,
  ].filter((line): line is string => Boolean(line));

  for (const attachment of task.attachments ?? []) {
    const body =
      attachment.text?.trim() || attachment.description?.trim() || '';
    if (!body) continue;
    lines.push('', `## ${attachment.originalName}`, body);
  }

  return lines.join('\n').slice(0, GTD_INDEX_CHARS);
}
