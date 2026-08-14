/*
 * Mirror own Instagram reels into the diary and write the full video index
 * (caption, transcript, on-screen description) into the linked notes so
 * diary RAG / MCP can search them. Diary-only videos (Telegram / uploads)
 * get the same treatment via their diary-v* reel proxies.
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-own-reels-to-diary.ts [--dry-run] [--limit N] [--skip-analyze]
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../services/storage.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { ReelsService } from '../services/reels.service';

function parseArgs(argv: string[]): {
  dryRun: boolean;
  skipAnalyze: boolean;
  limit: number | null;
} {
  let dryRun = false;
  let skipAnalyze = false;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--skip-analyze') skipAnalyze = true;
    else if (argv[i] === '--limit') {
      limit = Number(argv[++i]);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('--limit must be a positive number');
      }
    }
  }
  return { dryRun, skipAnalyze, limit };
}

function shortcodeFor(videoId: number): string {
  return `diary-v${videoId}`;
}

async function main(): Promise<void> {
  const { dryRun, skipAnalyze, limit } = parseArgs(process.argv.slice(2));
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
    const ownReels = await prisma.reel.findMany({
      where: {
        isOwn: true,
        status: 'ready',
        videoUrl: { not: null },
        NOT: { shortcode: { startsWith: 'diary-v' } },
      },
      select: { id: true, shortcode: true, title: true, publishedAt: true },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    });
    const ownList = limit ? ownReels.slice(0, limit) : ownReels;

    console.log(
      `Own Instagram reels: ${ownList.length}` +
        (dryRun ? ' (dry run)' : '') +
        '\n',
    );

    let created = 0;
    let linked = 0;
    let failed = 0;

    for (const row of ownList) {
      const date = row.publishedAt
        ? row.publishedAt.toISOString().slice(0, 10)
        : '—';
      console.log(`• ${row.shortcode} ${date} — ${row.title || '—'}`);
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
          console.log(`  linked/updated diary note #${result.noteId}`);
        }
      } catch (error) {
        failed++;
        console.error(`  FAIL: ${String(error)}`);
      }
    }

    console.log(
      `\nOwn reels: created ${created}, linked ${linked}, failed ${failed}` +
        (dryRun ? ' (dry run)' : ''),
    );

    const videos = await prisma.video.findMany({
      orderBy: { id: 'asc' },
      include: { note: { select: { noteDate: true, content: true } } },
    });
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
    let diaryVideos = [...urlWinner.values()].sort((a, b) => a.id - b.id);
    if (limit) diaryVideos = diaryVideos.slice(0, limit);

    if (skipAnalyze) {
      const existing = await prisma.reel.findMany({
        where: { shortcode: { startsWith: 'diary-v' } },
        select: { shortcode: true },
      });
      const haveProxy = new Set(existing.map((row) => row.shortcode));
      diaryVideos = diaryVideos.filter((video) =>
        haveProxy.has(shortcodeFor(video.id)),
      );
    }

    console.log(
      `\nDiary-only videos: ${diaryVideos.length} unique` +
        (skipAnalyze ? ' (existing proxies only)' : '') +
        '\n',
    );

    let proxied = 0;
    let analyzed = 0;
    let synced = 0;
    let diaryFailed = 0;

    for (const video of diaryVideos) {
      const shortcode = shortcodeFor(video.id);
      const publishedAt = video.note?.noteDate ?? video.createdAt;
      const description =
        video.description?.trim() || video.note?.content?.trim() || null;

      let reel = await prisma.reel.findUnique({ where: { shortcode } });
      console.log(`• ${shortcode} video #${video.id}`);

      if (!reel) {
        if (dryRun) {
          console.log('  would create diary-v proxy');
          proxied++;
          continue;
        }
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
        proxied++;
        console.log(`  created reel #${reel.id}`);
      }

      const needsAnalyze =
        reel.transcriptStatus !== 'ready' || reel.visionStatus !== 'ready';
      if (needsAnalyze && !skipAnalyze && !dryRun) {
        try {
          console.log('  analyzing (whisper → vision → embed)…');
          await reelsService.analyzeExistingVideo(reel.id);
          analyzed++;
        } catch (error) {
          diaryFailed++;
          console.error(`  ANALYZE FAIL: ${String(error)}`);
        }
      } else if (needsAnalyze && skipAnalyze) {
        console.log('  skip analyze');
      }

      if (dryRun) continue;

      try {
        const result = await reelsService.syncReelAnalysisIntoNote(reel.id);
        if (result) {
          synced++;
          console.log(
            `  ${result.updated ? 'updated' : 'unchanged'} note #${result.noteId}`,
          );
        } else {
          console.log('  no diary note linked');
        }
      } catch (error) {
        diaryFailed++;
        console.error(`  SYNC FAIL: ${String(error)}`);
      }
    }

    console.log(
      `\nDiary videos: proxied ${proxied}, analyzed ${analyzed},` +
        ` synced ${synced}, failed ${diaryFailed}` +
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
