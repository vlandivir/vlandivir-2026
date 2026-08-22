/*
 * One-off import of threads-poster canvas posts into ThreadsPost.
 *
 * Reads the Cursor canvas sidecar JSON, optional conversation dumps, and
 * local JPEG/PNG (uploaded to Spaces under threads/YYYY/MM/).
 *
 * Usage:
 *   npx ts-node src/scripts/import-threads-posts.ts [--dry-run]
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { S3 } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Prisma, PrismaClient } from '../generated/prisma-client';
import { v4 as uuidv4 } from 'uuid';
import { extForMime, mimeForFilename } from '../services/threads-text';

const CANVAS_DATA = join(
  homedir(),
  '.cursor/projects/Users-vladryba-dev-threads-poster/canvases/threads-composer.canvas.data.json',
);
const THREADS_POSTER = join(homedir(), 'dev/threads-poster');
const CONVERSATIONS = join(THREADS_POSTER, 'conversations');
const ENV_PATH = join(process.cwd(), '.env');

type CanvasPost = {
  id: string;
  text: string;
  status: string;
  updated?: string;
  destination?: string;
  ghost?: boolean;
  url?: string;
  mediaId?: string;
  topic?: string;
  poll?: string[];
  images?: string[];
  stats?: Record<string, unknown>;
  statsPrev?: Record<string, unknown>;
  pollResults?: Record<string, unknown>;
};

function parseEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#') || !raw.includes('=')) continue;
    const eq = raw.indexOf('=');
    const key = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes('--dry-run') };
}

function permalinkKey(url: string): string {
  return url.trim().replace(/\/+$/, '').split('/').pop() || '';
}

function loadConversations(): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!existsSync(CONVERSATIONS)) return map;
  for (const name of readdirSync(CONVERSATIONS)) {
    if (!name.endsWith('.json')) continue;
    const dump = JSON.parse(
      readFileSync(join(CONVERSATIONS, name), 'utf8'),
    ) as { root?: { permalink?: string; shortcode?: string } };
    const key =
      dump.root?.shortcode || permalinkKey(dump.root?.permalink || '');
    if (key) map.set(key, dump);
  }
  return map;
}

async function uploadLocalImage(
  s3: S3,
  bucket: string,
  endpoint: string,
  localPath: string,
): Promise<{ url: string; key: string } | null> {
  if (!existsSync(localPath)) return null;
  const buffer = readFileSync(localPath);
  const mime = mimeForFilename(localPath);
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `threads/${now.getUTCFullYear()}/${month}/${uuidv4()}${extForMime(mime)}`;
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
      ACL: 'public-read',
    },
  });
  await upload.done();
  return { url: `${endpoint}/${bucket}/${key}`, key };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));
  if (!existsSync(CANVAS_DATA)) {
    throw new Error(`Canvas data not found: ${CANVAS_DATA}`);
  }
  const canvas = JSON.parse(readFileSync(CANVAS_DATA, 'utf8')) as {
    posts?: CanvasPost[];
  };
  const posts = canvas.posts || [];
  const conversations = loadConversations();
  const env = parseEnv(ENV_PATH);
  const s3 = new S3({
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.DO_SPACES_ACCESS_KEY || '',
      secretAccessKey: env.DO_SPACES_SECRET_KEY || '',
    },
  });
  const prisma = new PrismaClient();
  let created = 0;
  let skipped = 0;

  console.log(
    `Importing ${posts.length} canvas posts${dryRun ? ' (dry run)' : ''}`,
  );

  try {
    for (const item of posts) {
      const existing = await prisma.threadsPost.findUnique({
        where: { canvasId: item.id },
      });
      if (existing) {
        skipped += 1;
        console.log(`skip ${item.id} → already #${existing.id}`);
        continue;
      }
      const shortcode = permalinkKey(item.url || '');
      const repliesJson = conversations.get(shortcode) ?? null;
      const images: { url: string; key: string; sortOrder: number }[] = [];
      for (const relative of item.images || []) {
        const localPath = relative.startsWith('/')
          ? relative
          : join(THREADS_POSTER, relative);
        if (dryRun) {
          images.push({
            url: `file://${localPath}`,
            key: relative,
            sortOrder: images.length,
          });
          continue;
        }
        const uploaded = await uploadLocalImage(
          s3,
          'vlandivir-2025',
          'https://fra1.digitaloceanspaces.com',
          localPath,
        );
        if (uploaded) {
          images.push({ ...uploaded, sortOrder: images.length });
        } else {
          console.log(`  missing image ${localPath}`);
        }
      }

      const publishedAt = item.updated ? new Date(item.updated) : null;
      console.log(
        `${item.status} ${item.id} images=${images.length} replies=${repliesJson ? 'yes' : 'no'}`,
      );
      if (dryRun) continue;

      await prisma.threadsPost.create({
        data: {
          canvasId: item.id,
          text: item.text || '',
          status: item.status === 'published' ? 'published' : 'draft',
          destination:
            item.destination === 'diary' ? 'diary' : 'threads',
          ghost: Boolean(item.ghost),
          topic: item.topic || null,
          poll: item.poll || [],
          url: item.url || null,
          mediaId: item.mediaId || null,
          stats: (item.stats as Prisma.InputJsonValue) ?? undefined,
          statsPrev: (item.statsPrev as Prisma.InputJsonValue) ?? undefined,
          pollResults: (item.pollResults as Prisma.InputJsonValue) ?? undefined,
          repliesJson: (repliesJson as Prisma.InputJsonValue) ?? undefined,
          publishedAt:
            item.status === 'published' && publishedAt && !Number.isNaN(publishedAt.getTime())
              ? publishedAt
              : undefined,
          images: images.length
            ? {
                create: images,
              }
            : undefined,
        },
      });
      created += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`created ${created}, skipped ${skipped}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
