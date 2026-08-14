import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { PrismaClient } from '../generated/prisma-client';

interface NoteWithMedia {
  content: string;
  noteDate: Date;
  images: { url: string; description?: string | null }[];
  videos: { url: string }[];
}

function usageAndExit(): never {
  console.log('Usage: ts-node src/scripts/generate-history-md.ts <chatId>');
  process.exit(1);
}

function parseArgs(): { chatId: number } {
  const args = process.argv.slice(2);
  if (args.length < 1) usageAndExit();
  const chatId = Number(args[0]);
  if (!Number.isFinite(chatId)) usageAndExit();
  return { chatId };
}

function toMd(messages: NoteWithMedia[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const date = format(m.noteDate, 'dd.MM.yyyy HH:mm', { locale: ru });
    lines.push(`## ${date}`);
    if (m.content) {
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
    if (m.images && m.images.length > 0) {
      for (const img of m.images) {
        const alt = (img.description || 'image').replace(/\|/g, ' ');
        lines.push(`![${alt}](${img.url})`);
        if (img.description) {
          lines.push('');
          lines.push(`_${img.description}_`);
        }
        lines.push('');
      }
    }
    if (m.videos && m.videos.length > 0) {
      for (const v of m.videos) {
        lines.push(`Video: ${v.url}`);
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const { chatId } = parseArgs();
  const prisma = new PrismaClient();
  try {
    const messages = await prisma.note.findMany({
      where: { chatId },
      orderBy: { noteDate: 'asc' },
      include: { images: true, videos: true },
    });
    const filtered = messages.filter((m) => {
      const longText = m.content && m.content.length > 21;
      const hasMedia =
        (m.images && m.images.length > 0) || (m.videos && m.videos.length > 0);
      return longText || hasMedia;
    }) as unknown as NoteWithMedia[];

    if (filtered.length === 0) {
      console.log('No messages matching criteria.');
      return;
    }

    const md = toMd(filtered);
    const outDir = path.resolve(__dirname, '../../pdf');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
    const outPath = path.join(outDir, `history-${chatId}-${timestamp}.md`);
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`Saved Markdown → ${outPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
