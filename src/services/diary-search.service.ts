import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';

export interface DiarySearchResult {
  noteId: number;
  noteDate: Date;
  snippet: string;
  similarity: number;
  viaImage: boolean;
}

@Injectable()
export class DiarySearchService {
  private readonly logger = new Logger(DiarySearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Index notes and image descriptions that don't have an embedding yet.
   * Called lazily before every search, so new diary entries become
   * searchable without hooking every note-creation code path.
   */
  async indexMissing(
    chatId?: bigint,
  ): Promise<{ notes: number; images: number }> {
    const notes = await this.prisma.$queryRaw<
      { id: number; content: string; chatId: bigint }[]
    >`
      SELECT n."id", n."content", n."chatId"
      FROM "Note" n
      LEFT JOIN "Embedding" e ON e."kind" = 'note' AND e."refId" = n."id"
      WHERE e."id" IS NULL
        AND n."deletedAt" IS NULL
        AND length(trim(n."content")) > 0
        AND (${chatId ?? null}::bigint IS NULL OR n."chatId" = ${chatId ?? null}::bigint)
      ORDER BY n."id" ASC
    `;
    await this.embeddingsService.upsertMany(
      'note',
      notes.map((note) => ({
        refId: note.id,
        content: note.content,
        chatId: note.chatId,
      })),
    );

    // Images inherit the chat scope from their note; images without a
    // note are skipped — there is no chat to scope them to.
    const images = await this.prisma.$queryRaw<
      { id: number; description: string; chatId: bigint }[]
    >`
      SELECT i."id", i."description", n."chatId"
      FROM "Image" i
      JOIN "Note" n ON n."id" = i."noteId"
      LEFT JOIN "Embedding" e ON e."kind" = 'image' AND e."refId" = i."id"
      WHERE e."id" IS NULL
        AND n."deletedAt" IS NULL
        AND i."description" IS NOT NULL AND i."description" <> ''
        AND (${chatId ?? null}::bigint IS NULL OR n."chatId" = ${chatId ?? null}::bigint)
      ORDER BY i."id" ASC
    `;
    await this.embeddingsService.upsertMany(
      'image',
      images.map((image) => ({
        refId: image.id,
        content: image.description,
        chatId: image.chatId,
      })),
    );

    if (notes.length || images.length) {
      this.logger.log(
        `Indexed ${notes.length} notes and ${images.length} images` +
          (chatId ? ` for chat ${chatId}` : ''),
      );
    }
    return { notes: notes.length, images: images.length };
  }

  /**
   * Semantic search over one chat's notes and image descriptions.
   * Image hits are resolved to their note; per note the best
   * similarity wins. Results are sorted best first.
   */
  async search(
    chatId: bigint,
    query: string,
    limit = 8,
  ): Promise<DiarySearchResult[]> {
    const hits = await this.retrieve(chatId, query, limit);
    return hits.map((hit) => ({
      noteId: hit.noteId,
      noteDate: hit.noteDate,
      snippet: hit.content.replace(/\s+/g, ' ').slice(0, 120),
      similarity: hit.similarity,
      viaImage: hit.viaImage,
    }));
  }

  /**
   * Same retrieval, but with the full note text (plus the matched image
   * description, if any) — used by search snippets and the Q&A mode.
   */
  async retrieve(
    chatId: bigint,
    query: string,
    limit = 8,
  ): Promise<
    {
      noteId: number;
      noteDate: Date;
      content: string;
      similarity: number;
      viaImage: boolean;
    }[]
  > {
    await this.indexMissing(chatId);

    const [noteHits, imageHits] = await Promise.all([
      this.embeddingsService.search('note', query, { chatId, limit }),
      this.embeddingsService.search('image', query, { chatId, limit }),
    ]);

    const imageRows = imageHits.length
      ? await this.prisma.image.findMany({
          where: { id: { in: imageHits.map((hit) => hit.refId) } },
          select: { id: true, noteId: true, description: true },
        })
      : [];
    const imageById = new Map(imageRows.map((row) => [row.id, row]));

    // noteId -> best hit
    const byNote = new Map<
      number,
      { similarity: number; viaImage: boolean; imageDescription?: string }
    >();
    for (const hit of noteHits) {
      byNote.set(hit.refId, { similarity: hit.similarity, viaImage: false });
    }
    for (const hit of imageHits) {
      const image = imageById.get(hit.refId);
      if (!image?.noteId) continue;
      const existing = byNote.get(image.noteId);
      if (!existing || hit.similarity > existing.similarity) {
        byNote.set(image.noteId, {
          similarity: hit.similarity,
          viaImage: true,
          imageDescription: image.description ?? undefined,
        });
      }
    }
    if (!byNote.size) return [];

    const noteRows = await this.prisma.note.findMany({
      where: { id: { in: [...byNote.keys()] }, deletedAt: null },
      select: { id: true, content: true, noteDate: true },
    });

    return noteRows
      .map((note) => {
        const hit = byNote.get(note.id)!;
        const parts = [note.content?.trim() || null];
        if (hit.viaImage && hit.imageDescription) {
          parts.push(`Описание фото: ${hit.imageDescription.trim()}`);
        }
        return {
          noteId: note.id,
          noteDate: note.noteDate,
          content: parts.filter(Boolean).join('\n') || '(без текста)',
          similarity: hit.similarity,
          viaImage: hit.viaImage,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}
