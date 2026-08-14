import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as PDFDocument from 'pdfkit';
import sizeOf from 'image-size';

export interface HistoryPdfMessage {
  content: string;
  noteDate: Date;
  images: { url: string; description?: string | null }[];
  videos: { url: string }[];
}

@Injectable()
export class PdfService {
  async renderHistoryPdf(messages: HistoryPdfMessage[]): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 56, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const fontPath = this.resolveCyrillicFont();
    if (fontPath) {
      doc.font(fontPath);
    }

    const baseFontSize = 11;
    const smallFontSize = 9;
    doc.fontSize(baseFontSize);

    const availableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (i > 0) doc.addPage();

      const date = format(m.noteDate, 'dd.MM.yyyy HH:mm', { locale: ru });
      doc.fillColor('#666').fontSize(smallFontSize).text(date);
      doc.moveDown(0.5);
      doc
        .fillColor('#000')
        .fontSize(baseFontSize)
        .text(m.content || '', { width: availableWidth });

      for (const img of m.images || []) {
        try {
          const res = await fetch(img.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          const maxH = 400;
          const dim = sizeOf(buf);
          const origW = Math.max(1, dim.width || 1);
          const origH = Math.max(1, dim.height || 1);
          const ratio = Math.min(availableWidth / origW, maxH / origH, 1);
          const drawW = Math.floor(origW * ratio);
          const drawH = Math.floor(origH * ratio);

          if (doc.y + drawH > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
          }
          const y = doc.y + 4;
          doc.image(buf, doc.x, y, { width: drawW, height: drawH });
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
    return done;
  }

  // Built-in PDF fonts have no Cyrillic glyphs, so a bundled TTF is required
  private resolveCyrillicFont(): string | null {
    const candidates = [
      path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      path.resolve(__dirname, '../../assets/fonts/NotoSans-Regular.ttf'),
      path.resolve(__dirname, '../../../assets/fonts/NotoSans-Regular.ttf'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    console.warn(
      'NotoSans-Regular.ttf not found; PDF will use the built-in font and Cyrillic text will not render',
    );
    return null;
  }
}
