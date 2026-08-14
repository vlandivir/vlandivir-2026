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
  console.log('Usage: npm run generate-history-pdf:html -- <chatId>');
  process.exit(1);
}

function parseArgs(): { chatId: number } {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    usageAndExit();
  }
  const chatId = Number(args[0]);
  if (!Number.isFinite(chatId)) {
    usageAndExit();
  }
  return { chatId };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateHtml(messages: NoteWithMedia[]): string {
  let html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>История чата (Local)</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
      line-height: 1.6;
    }
    .message { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #667eea; }
    .message-date { color: #666; font-size: 0.9em; margin-bottom: 8px; }
    .message-content { color: #333; white-space: pre-wrap; }
    .message-image img { max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .image-description { margin-top: 4px; font-size: 0.9em; color: #555; }
    .message-video { margin-top: 10px; }
  </style>
</head>
<body>
`;

  for (const message of messages) {
    const date = format(message.noteDate, 'dd.MM.yyyy HH:mm', { locale: ru });
    html += `
  <div class="message">
    <div class="message-date">${date}</div>
    <div class="message-content">${escapeHtml(message.content || '')}</div>
`;
    if (message.images && message.images.length > 0) {
      for (const image of message.images) {
        const description = image.description
          ? escapeHtml(image.description)
          : '';
        html += `
    <div class="message-image">
      <img src="${image.url}" alt="${description || 'image'}" />
      ${description ? `<div class="image-description">${description}</div>` : ''}
    </div>
`;
      }
    }
    if (message.videos && message.videos.length > 0) {
      for (const video of message.videos) {
        const safe = escapeHtml(video.url);
        html += `
    <div class="message-video">Video: <a href="${safe}">${safe}</a></div>
`;
      }
    }
    html += '  </div>';
  }

  html += '\n</body>\n</html>';
  return html;
}

async function main() {
  const { chatId } = parseArgs();
  const prisma = new PrismaClient();
  try {
    console.log(`Fetching notes for chatId=${chatId} ...`);
    const messages = await prisma.note.findMany({
      where: { chatId },
      orderBy: { noteDate: 'asc' },
      include: { images: true, videos: true },
    });

    const filtered: NoteWithMedia[] = messages.filter((m) => {
      const longText = m.content && m.content.length > 21;
      const hasMedia =
        (m.images && m.images.length > 0) || (m.videos && m.videos.length > 0);
      return longText || hasMedia;
    }) as unknown as NoteWithMedia[];

    if (filtered.length === 0) {
      console.log('No messages matching criteria (length>21 or has media).');
      return;
    }

    const html = generateHtml(filtered);
    const outDir = path.resolve(__dirname, '../../pdf');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
    const outPath = path.join(outDir, `history-${chatId}-${timestamp}.html`);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`Saved HTML → ${outPath}`);
  } catch (err) {
    console.error('Error generating HTML:', err);
    process.exitCode = 1;
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
