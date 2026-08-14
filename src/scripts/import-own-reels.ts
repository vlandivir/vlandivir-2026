/*
 * One-off import of my own Instagram reels into the shared Reel table.
 *
 * Creates records only — it does NOT download video / run the yt-dlp pipeline
 * (that hits Instagram from the droplet and risks the account). New reels land
 * as `status: 'pending'` with `source: 'own'`, `isOwn: true`, seeded with the
 * publish date and caption we already collected. Reels that already exist
 * (e.g. pulled in from the map) are only flagged `isOwn: true` — their source,
 * status and any processed data are left untouched.
 *
 * The reels list is a JSON array (shortcode, taken_at, caption, duration),
 * collected via Instagram's web feed API. It is not stored in this repo —
 * pass it with --file.
 *
 * Usage:
 *   ts-node src/scripts/import-own-reels.ts --file <path> [--dry-run]
 */
import { existsSync, readFileSync } from 'fs';
import { PrismaClient } from '../generated/prisma-client';

interface RawReel {
  code: string;
  taken_at?: number | null; // unix seconds
  caption?: string | null;
  duration?: number | null;
}

function parseArgs(argv: string[]): { file: string; dryRun: boolean } {
  let file: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') file = argv[++i];
    else if (argv[i] === '--dry-run') dryRun = true;
  }
  if (!file) {
    throw new Error(
      'Pass --file <path> to own-reels.json (the dump is not in this repo)',
    );
  }
  return { file, dryRun };
}

async function importOwnReels(): Promise<void> {
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }
  const items = JSON.parse(readFileSync(file, 'utf-8')) as RawReel[];
  console.log(
    `📥 Importing ${items.length} own reels from ${file}${
      dryRun ? ' (dry run)' : ''
    }\n`,
  );

  const prisma = new PrismaClient();
  let created = 0;
  let flagged = 0; // already existed, now marked isOwn
  let unchanged = 0; // already existed and already isOwn

  try {
    for (const item of items) {
      const shortcode = item.code;
      if (!shortcode) continue;
      const instagramUrl = `https://www.instagram.com/reel/${shortcode}/`;
      const publishedAt = item.taken_at ? new Date(item.taken_at * 1000) : null;
      const description = item.caption?.trim() || null;
      const duration = typeof item.duration === 'number' ? item.duration : null;

      const existing = await prisma.reel.findUnique({
        where: { shortcode },
        select: {
          id: true,
          isOwn: true,
          source: true,
          publishedAt: true,
          description: true,
          duration: true,
        },
      });

      if (!existing) {
        if (!dryRun) {
          await prisma.reel.create({
            data: {
              instagramUrl,
              shortcode,
              source: 'own',
              isOwn: true,
              status: 'pending',
              publishedAt,
              description,
              duration,
            },
          });
        }
        created++;
        console.log(`  + create  ${shortcode}`);
        continue;
      }

      if (existing.isOwn) {
        unchanged++;
        continue;
      }

      if (!dryRun) {
        // Flag as mine without clobbering data a prior pipeline run produced;
        // only backfill fields that are still empty.
        await prisma.reel.update({
          where: { id: existing.id },
          data: {
            isOwn: true,
            publishedAt: existing.publishedAt ?? publishedAt,
            description: existing.description ?? description,
            duration: existing.duration ?? duration,
          },
        });
      }
      flagged++;
      console.log(`  ~ flag    ${shortcode} (source=${existing.source})`);
    }

    console.log(
      `\n✅ Done: created ${created}, flagged existing ${flagged}, already mine ${unchanged}, total ${items.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

importOwnReels().catch((error) => {
  console.error(error);
  process.exit(1);
});
