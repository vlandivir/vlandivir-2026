/*
 * Import diary Video rows into the Reel table and run the same analysis
 * pipeline as Instagram reels: Whisper transcript → frame vision → title +
 * search embedding (kind=reel) for RAG / duplicate search.
 *
 * Usage:
 *   npx ts-node src/scripts/process-diary-videos.ts [--dry-run] [--limit N] [--force]
 *
 * Shortcode: diary-v{videoId}. Re-runs skip videos that already have
 * transcript+vision ready unless --force is set (embedding is still ensured).
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../services/storage.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { ReelsService } from '../services/reels.service';

function parseArgs(argv: string[]): {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
} {
  let dryRun = false;
  let force = false;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--force') force = true;
    else if (argv[i] === '--limit') {
      limit = Number(argv[++i]);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('--limit must be a positive number');
      }
    }
  }
  return { dryRun, force, limit };
}

function shortcodeFor(videoId: number): string {
  return `diary-v${videoId}`;
}

async function main(): Promise<void> {
  const { dryRun, force, limit } = parseArgs(process.argv.slice(2));
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
    const videos = await prisma.video.findMany({
      orderBy: { id: 'asc' },
      include: { note: { select: { noteDate: true, content: true } } },
    });

    // Prefer the copy that already has a caption when the same file was saved
    // twice (channel + personal chat).
    const byUrl = new Map<number, (typeof videos)[number]>();
    const urlWinner = new Map<string, (typeof videos)[number]>();
    for (const video of videos) {
      const existing = urlWinner.get(video.url);
      if (
        !existing ||
        (!!video.description && !existing.description) ||
        (!!video.description === !!existing.description &&
          video.id < existing.id)
      ) {
        urlWinner.set(video.url, video);
      }
    }
    for (const video of urlWinner.values()) {
      byUrl.set(video.id, video);
    }

    let list = [...byUrl.values()].sort((a, b) => a.id - b.id);
    if (limit) list = list.slice(0, limit);

    console.log(
      `Diary videos: ${videos.length} rows → ${list.length} unique` +
        (dryRun ? ' (dry run)' : '') +
        (force ? ' (force)' : '') +
        '\n',
    );

    let created = 0;
    let analyzed = 0;
    let skipped = 0;
    let embedded = 0;
    let failed = 0;

    for (const video of list) {
      const shortcode = shortcodeFor(video.id);
      const publishedAt = video.note?.noteDate ?? video.createdAt;
      const description =
        video.description?.trim() || video.note?.content?.trim() || null;

      let reel = await prisma.reel.findUnique({ where: { shortcode } });

      if (!reel) {
        console.log(`+ create  ${shortcode} (video #${video.id})`);
        if (!dryRun) {
          reel = await prisma.reel.create({
            data: {
              instagramUrl: `https://vlandivir.com/diary/video/${video.id}`,
              shortcode,
              source: 'notebook',
              status: 'ready',
              videoUrl: video.url,
              description,
              publishedAt,
              meta: { diaryVideoId: video.id },
            },
          });
        }
        created++;
        if (dryRun) continue;
      } else {
        console.log(`~ reuse   ${shortcode} (reel #${reel.id})`);
        if (!dryRun && (!reel.videoUrl || reel.videoUrl !== video.url)) {
          reel = await prisma.reel.update({
            where: { id: reel.id },
            data: {
              videoUrl: video.url,
              description: reel.description ?? description,
              publishedAt: reel.publishedAt ?? publishedAt,
              status: 'ready',
              meta: { diaryVideoId: video.id },
            },
          });
        }
      }

      if (!reel) continue;

      const alreadyDone =
        reel.transcriptStatus === 'ready' && reel.visionStatus === 'ready';
      if (alreadyDone && !force) {
        await reelsService.indexReel(reel.id);
        const emb = await prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM "Embedding"
          WHERE kind = 'reel' AND "refId" = ${reel.id}
        `;
        if (emb[0]?.n) embedded++;
        skipped++;
        console.log(
          `  skip analyze (already ready), embedding ok=${!!emb[0]?.n}`,
        );
        continue;
      }

      if (dryRun) {
        console.log('  would analyze');
        continue;
      }

      try {
        console.log('  analyzing (whisper → vision → embed)…');
        await reelsService.analyzeExistingVideo(reel.id);
        analyzed++;

        const fresh = await prisma.reel.findUnique({
          where: { id: reel.id },
          select: {
            transcriptStatus: true,
            visionStatus: true,
            title: true,
            visionDescription: true,
          },
        });
        const emb = await prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM "Embedding"
          WHERE kind = 'reel' AND "refId" = ${reel.id}
        `;
        if (emb[0]?.n) embedded++;
        console.log(
          `  done tx=${fresh?.transcriptStatus} vision=${fresh?.visionStatus}` +
            ` embed=${emb[0]?.n || 0}` +
            (fresh?.title ? ` title="${fresh.title}"` : ''),
        );
      } catch (error) {
        failed++;
        console.error(`  FAIL: ${String(error)}`);
      }
    }

    console.log(
      `\nDone: created ${created}, analyzed ${analyzed}, skipped ${skipped},` +
        ` embeddings present ${embedded}, failed ${failed}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
