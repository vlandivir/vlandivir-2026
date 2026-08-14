import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { PrismaClient } from '../generated/prisma-client';
import * as PDFDocument from 'pdfkit';
import sizeOf from 'image-size';

interface NoteWithMedia {
  content: string;
  noteDate: Date;
  images: { url: string; description?: string | null }[];
  videos: { url: string }[];
}

function usageAndExit(): never {
  console.log('Usage: npm run generate-history-pdf -- <chatId>');
  console.log(
    'Example: npm run generate-history-pdf -- "$TELEGRAM_OWNER_CHAT_ID"',
  );
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

async function renderPdf(
  messages: NoteWithMedia[],
  outPath: string,
): Promise<void> {
  const doc = new PDFDocument({ margin: 56, size: 'A4' });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  // Ensure and use Noto Sans Regular for Cyrillic support
  const projectRoot = path.resolve(__dirname, '../../');
  const fontsDir = path.join(projectRoot, 'assets', 'fonts');
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
  const notoSansPath = path.join(fontsDir, 'NotoSans-Regular.ttf');
  if (!fs.existsSync(notoSansPath)) {
    try {
      const fontUrl =
        'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
      const resp = await fetch(fontUrl);
      const arr = await resp.arrayBuffer();
      fs.writeFileSync(notoSansPath, Buffer.from(arr));
      console.log(`Downloaded font → ${notoSansPath}`);
    } catch {
      console.warn(
        'Failed to auto-download NotoSans-Regular.ttf; falling back to built-in font. Cyrillic may not render.',
      );
    }
  }
  if (fs.existsSync(notoSansPath)) {
    doc.font(notoSansPath);
  }
  // Base font sizes
  const baseFontSize = 11;
  const smallFontSize = 9; // for dates, captions, links
  doc.fontSize(baseFontSize);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (i > 0) doc.addPage(); // new page per message

    const date = format(m.noteDate, 'dd.MM.yyyy HH:mm', { locale: ru });
    doc.fillColor('#666').fontSize(smallFontSize).text(date);
    doc.moveDown(0.5);
    const availableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc
      .fillColor('#000')
      .fontSize(baseFontSize)
      .text(m.content || '', { width: availableWidth });

    // images max height 400px, preserve aspect
    if (m.images && m.images.length > 0) {
      for (const img of m.images) {
        try {
          // Download image to buffer
          const res = await fetch(img.url);
          const buf = Buffer.from(await res.arrayBuffer());
          // Constrain to page width and max height 400px, preserve aspect
          const maxH = 400;
          const maxW = availableWidth;
          const dim = sizeOf(buf);
          const origW = Math.max(1, dim.width || 1);
          const origH = Math.max(1, dim.height || 1);
          const ratio = Math.min(maxW / origW, maxH / origH, 1);
          const drawW = Math.floor(origW * ratio);
          const drawH = Math.floor(origH * ratio);

          const x = doc.x;
          const y = doc.y + 4;
          doc.image(buf, x, y, { width: drawW, height: drawH });
          // Move cursor below the image to avoid text overlay
          doc.y = y + drawH;
          doc.moveDown(0.25);

          if (img.description) {
            doc
              .fillColor('#555')
              .fontSize(smallFontSize)
              .text(img.description, { width: availableWidth });
            doc.fillColor('#000').fontSize(baseFontSize);
          }
        } catch {
          doc.moveDown();
          doc
            .fillColor('#c00')
            .fontSize(smallFontSize)
            .text('[image failed to load]');
          doc.fillColor('#000').fontSize(baseFontSize);
        }
      }
    }

    if (m.videos && m.videos.length > 0) {
      doc.moveDown(0.5);
      doc.fillColor('#1a73e8').fontSize(smallFontSize);
      for (const v of m.videos) {
        doc.text(v.url, {
          link: v.url,
          underline: true,
          width: availableWidth,
        });
      }
      doc.fillColor('#000').fontSize(baseFontSize);
    }
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
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

    const projectRoot = path.resolve(__dirname, '../../');
    const outDir = path.join(projectRoot, 'pdf');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');

    // 1) Обычная версия (по времени: год-месяц-день)
    const outPath = path.join(outDir, `history-${chatId}-${timestamp}.pdf`);
    await renderPdf(filtered, outPath);
    console.log(`Saved PDF → ${outPath}`);

    // 2) Версия с сортировкой: сначала день/месяц, потом год
    const dayFirst = [...filtered].sort((a, b) => {
      const ma = a.noteDate.getMonth();
      const mb = b.noteDate.getMonth();
      if (ma !== mb) return ma - mb;
      const da = a.noteDate.getDate();
      const db = b.noteDate.getDate();
      if (da !== db) return da - db;
      const ya = a.noteDate.getFullYear();
      const yb = b.noteDate.getFullYear();
      if (ya !== yb) return ya - yb;
      return a.noteDate.getTime() - b.noteDate.getTime();
    });
    const outPathDayFirst = path.join(
      outDir,
      `history-day-first-${chatId}-${timestamp}.pdf`,
    );
    await renderPdf(dayFirst, outPathDayFirst);
    console.log(`Saved day-first PDF → ${outPathDayFirst}`);
  } catch (err) {
    console.error('Error generating PDF:', err);
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
