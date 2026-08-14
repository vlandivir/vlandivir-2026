import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

export type EmbeddingKind = 'reel' | 'note' | 'image';

// text-embedding-3-small supports up to 8191 tokens; keep a safe char margin
const MAX_INPUT_CHARS = 24000;
const EMBEDDINGS_TIMEOUT_MS = 30 * 1000;

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get model(): string {
    return (
      this.configService.get<string>('EMBEDDING_MODEL') ||
      'text-embedding-3-small'
    );
  }

  async embedText(text: string): Promise<number[]> {
    const [embedding] = await this.embedTexts([text]);
    return embedding;
  }

  // One API call for up to ~100 texts — used by bulk indexing
  async embedTexts(texts: string[]): Promise<number[][]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts.map((text) => text.slice(0, MAX_INPUT_CHARS)),
      }),
      signal: AbortSignal.timeout(EMBEDDINGS_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Embeddings API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: { index?: number; embedding?: number[] }[];
    };
    const embeddings = data.data?.map((d) => d.embedding);
    if (
      !embeddings ||
      embeddings.length !== texts.length ||
      embeddings.some((e) => !e?.length)
    ) {
      throw new Error('Embeddings API returned an incomplete result');
    }
    return embeddings as number[][];
  }

  async upsert(
    kind: EmbeddingKind,
    refId: number,
    content: string,
    chatId?: bigint | null,
  ): Promise<void> {
    const embedding = await this.embedText(content);
    const vector = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      INSERT INTO "Embedding" ("kind", "refId", "chatId", "content", "embedding", "updatedAt")
      VALUES (${kind}, ${refId}, ${chatId ?? null}, ${content}, ${vector}::vector, NOW())
      ON CONFLICT ("kind", "refId") DO UPDATE SET
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "chatId" = EXCLUDED."chatId",
        "updatedAt" = NOW()
    `;
  }

  // Bulk upsert: one embeddings API call per chunk, then row-by-row insert
  async upsertMany(
    kind: EmbeddingKind,
    items: { refId: number; content: string; chatId?: bigint | null }[],
  ): Promise<void> {
    const CHUNK = 100;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const vectors = await this.embedTexts(chunk.map((item) => item.content));
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const vector = `[${vectors[j].join(',')}]`;
        await this.prisma.$executeRaw`
          INSERT INTO "Embedding" ("kind", "refId", "chatId", "content", "embedding", "updatedAt")
          VALUES (${kind}, ${item.refId}, ${item.chatId ?? null}, ${item.content}, ${vector}::vector, NOW())
          ON CONFLICT ("kind", "refId") DO UPDATE SET
            "content" = EXCLUDED."content",
            "embedding" = EXCLUDED."embedding",
            "chatId" = EXCLUDED."chatId",
            "updatedAt" = NOW()
        `;
      }
    }
  }

  async remove(kind: EmbeddingKind, refId: number): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "Embedding" WHERE "kind" = ${kind} AND "refId" = ${refId}
    `;
  }

  /**
   * Cosine-similarity search within one kind. Returns refIds with a
   * similarity in [0..1], best first. chatId narrows the scope for
   * private kinds (notes, images); for reels it is not used. refIds, when
   * given, restricts the search to that allowlist of refIds (e.g. only the
   * reels that are linked to a map feature) — an empty list short-circuits
   * to no results without hitting the embeddings API.
   */
  async search(
    kind: EmbeddingKind,
    query: string,
    options: {
      limit?: number;
      minSimilarity?: number;
      chatId?: bigint;
      refIds?: number[];
    } = {},
  ): Promise<{ refId: number; similarity: number }[]> {
    const { limit = 12, minSimilarity = 0.3, chatId, refIds } = options;
    if (refIds && refIds.length === 0) return [];
    const embedding = await this.embedText(query);
    const vector = `[${embedding.join(',')}]`;
    const refIdFilter = refIds
      ? Prisma.sql`AND "refId" = ANY(${refIds})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { refId: number; similarity: number }[]
    >(Prisma.sql`
      SELECT "refId", 1 - ("embedding" <=> ${vector}::vector) AS "similarity"
      FROM "Embedding"
      WHERE "kind" = ${kind}
        AND (${chatId ?? null}::bigint IS NULL OR "chatId" = ${chatId ?? null}::bigint)
        ${refIdFilter}
        AND 1 - ("embedding" <=> ${vector}::vector) >= ${minSimilarity}
      ORDER BY "embedding" <=> ${vector}::vector
      LIMIT ${limit}
    `);
    return rows;
  }
}
