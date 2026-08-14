/*
 * Mirror own Instagram reels that are missing from the diary into Note+Video
 * rows (chat = TELEGRAM_OWNER_CHAT_ID), dated with Instagram publishedAt.
 *
 * Uses the same embedding threshold as the duplicate review: if the best
 * diary-v* match is already ≥ 0.75 (or a diary-v* was manually marked
 * duplicateOf this shortcode), ensureOwnReelInDiary only links meta —
 * it does not create a second note. Everything below the threshold gets a
 * new diary entry.
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-own-reels-to-diary.ts [--dry-run] [--limit N]
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../services/storage.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { ReelsService } from '../services/reels.service';

const THRESHOLD = 0.75;

function parseArgs(argv: string[]): { dryRun: boolean; limit: number | null } {
  let dryRun = false;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--limit') {
      limit = Number(argv[++i]);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('--limit must be a positive number');
      }
    }
  }
  return { dryRun, limit };
}

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const configService = new ConfigService();
  const prisma = new PrismaService();
  const storage = new StorageService(configService);
  const embeddings = new EmbeddingsService(prisma, configService);
  const reelsService = new ReelsService(
    prisma,
    configService,
    storage,
    embeddings,
  );

  try {
    const marked = await prisma.reel.findMany({
      where: { shortcode: { startsWith: 'diary-v' } },
      select: { meta: true },
    });
    const manualDupes = new Set(
      marked
        .map((r) =>
          r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)
            ? (r.meta as { duplicateOf?: string }).duplicateOf
            : undefined,
        )
        .filter((v): v is string => typeof v === 'string'),
    );

    const pairs = await prisma.$queryRaw<
      {
        id: number;
        shortcode: string;
        title: string | null;
        published_at: Date | null;
        similarity: number;
      }[]
    >`
      WITH own AS (
        SELECT r.id, r.shortcode, r.title, r."publishedAt", e.embedding
        FROM "Reel" r
        JOIN "Embedding" e ON e.kind = 'reel' AND e."refId" = r.id
        WHERE r."isOwn" = true AND r.status = 'ready' AND r."videoUrl" IS NOT NULL
          AND r.shortcode NOT LIKE 'diary-v%'
      ),
      diary AS (
        SELECT r.id, e.embedding
        FROM "Reel" r
        JOIN "Embedding" e ON e.kind = 'reel' AND e."refId" = r.id
        WHERE r.shortcode LIKE 'diary-v%'
      )
      SELECT
        o.id, o.shortcode, o.title, o."publishedAt" AS published_at,
        (1 - (o.embedding <=> d.embedding))::float AS similarity
      FROM own o
      CROSS JOIN LATERAL (
        SELECT * FROM diary d ORDER BY o.embedding <=> d.embedding LIMIT 1
      ) d
      ORDER BY o."publishedAt" ASC NULLS LAST, o.id ASC
    `;

    let missing = pairs.filter(
      (r) => !manualDupes.has(r.shortcode) && r.similarity < THRESHOLD,
    );
    if (limit) missing = missing.slice(0, limit);

    console.log(
      `Own reels missing from diary: ${missing.length}` +
        (dryRun ? ' (dry run)' : '') +
        '\n',
    );

    let created = 0;
    let linked = 0;
    let failed = 0;

    for (const row of missing) {
      const date = row.published_at
        ? new Date(row.published_at).toISOString().slice(0, 10)
        : '—';
      console.log(
        `• ${row.shortcode} ${date} sim=${row.similarity.toFixed(2)} — ${row.title || '—'}`,
      );
      if (dryRun) continue;

      try {
        const result = await reelsService.ensureOwnReelInDiary(row.id);
        if (!result) {
          console.log('  skipped (not ready / not own)');
          continue;
        }
        if (result.created) {
          created++;
          console.log(`  created diary note #${result.noteId}`);
        } else {
          linked++;
          console.log(`  linked existing diary note #${result.noteId}`);
        }
      } catch (error) {
        failed++;
        console.error(`  FAIL: ${String(error)}`);
      }
    }

    console.log(
      `\nDone: created ${created}, linked ${linked}, failed ${failed}` +
        (dryRun ? ' (dry run)' : ''),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
