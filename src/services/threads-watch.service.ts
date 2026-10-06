import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizeWatchUrl,
  parseWatchEmbed,
  WATCH_DESTINATION,
} from './threads-watch-parser';
import {
  fetchPublicReplies,
  PublicRepliesDump,
} from './threads-public-replies';

@Injectable()
export class ThreadsWatchService {
  private readonly jobs = new Set<number>();
  private readonly logger = new Logger(ThreadsWatchService.name);
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.threadsPost.findMany({
      where: { destination: WATCH_DESTINATION },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        text: true,
        url: true,
        topic: true,
        stats: true,
        statsPrev: true,
        repliesJson: true,
        createdAt: true,
      },
    });
  }

  async replies(id: number) {
    const post = await this.requirePost(id);
    const dump = post.repliesJson as PublicRepliesDump | null;
    // A process restart interrupts an in-memory worker, but keeps its cache.
    if (dump?.sync === 'running' && !this.jobs.has(id))
      return { ...dump, sync: 'failed' };
    return dump;
  }

  async refreshReplies(id: number) {
    const post = await this.requirePost(id);
    if (this.jobs.has(id)) return post.repliesJson;
    const previous = post.repliesJson as PublicRepliesDump | null;
    const running = {
      ...(previous || { rootId: '', replies: [], freshIds: [] }),
      sync: 'running',
      checked: 0,
      queued: 1,
      complete: false,
    };
    this.jobs.add(id);
    try {
      await this.prisma.threadsPost.update({
        where: { id },
        data: { repliesJson: running as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      this.jobs.delete(id);
      throw error;
    }
    // Start after returning the acknowledgement; one worker per watched post.
    const expected = (post.stats as { replies?: number } | null)?.replies;
    void this.collectReplies(id, post.url!, previous, expected)
      .catch(() => {
        this.logger.warn(`Reply collection interrupted for watched post ${id}`);
      })
      .finally(() => this.jobs.delete(id));
    return running;
  }

  private async collectReplies(
    id: number,
    url: string,
    previous: PublicRepliesDump | null,
    expected?: number,
  ) {
    const known = new Set((previous?.replies || []).map((reply) => reply.id));
    try {
      await fetchPublicReplies(url, async (snapshot) => {
        if (
          snapshot.complete &&
          typeof expected === 'number' &&
          snapshot.replies.length < expected
        ) {
          snapshot = {
            ...snapshot,
            complete: false,
            sync: 'partial',
            unavailable: true,
          };
        }
        const merged = new Map(
          (snapshot.complete ? [] : previous?.replies || []).map((reply) => [
            reply.id,
            reply,
          ]),
        );
        snapshot.replies.forEach((reply) => merged.set(reply.id, reply));
        const dump = {
          ...snapshot,
          replies: [...merged.values()],
          freshIds: (previous?.updated ? snapshot.replies : [])
            .filter((reply) => !known.has(reply.id))
            .map((reply) => reply.id),
        };
        await this.prisma.threadsPost.update({
          where: { id },
          data: { repliesJson: dump as unknown as Prisma.InputJsonValue },
        });
      });
    } catch {
      await this.prisma.threadsPost.update({
        where: { id },
        data: {
          repliesJson: {
            ...(previous || { replies: [], freshIds: [] }),
            sync: 'failed',
            complete: false,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  async add(input: unknown) {
    const link = this.link(input);
    // canvasId is already unique, so URL aliases and concurrent additions
    // resolve to one watch record without a database migration.
    return this.prisma.threadsPost.upsert({
      where: { canvasId: `watch:${link.code}` },
      update: {},
      create: {
        canvasId: `watch:${link.code}`,
        destination: WATCH_DESTINATION,
        source: 'watch',
        status: 'published',
        text: '',
        url: link.url,
        topic: link.username,
      },
    });
  }

  async refresh(id: number) {
    const post = await this.requirePost(id);
    const link = this.link(post.url);
    let snapshot: ReturnType<typeof parseWatchEmbed>;
    try {
      const response = await fetch(`${link.url}/embed`, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Bound memory even if a third party returns an unexpectedly large page.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty response');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 2_000_000) throw new Error('Response too large');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      snapshot = parseWatchEmbed(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new BadGatewayException(
        'Threads public post is unavailable. Saved data has been kept.',
      );
    }
    return this.prisma.threadsPost.update({
      where: { id },
      data: {
        text: snapshot.text || post.text,
        stats: snapshot.stats as unknown as Prisma.InputJsonValue,
        statsPrev: post.stats === null ? Prisma.JsonNull : post.stats,
      },
    });
  }

  async remove(id: number) {
    if (this.jobs.has(id))
      throw new ConflictException('Replies are still loading');
    await this.requirePost(id);
    await this.prisma.threadsPost.delete({ where: { id } });
    return { ok: true };
  }

  private async requirePost(id: number) {
    const post = await this.prisma.threadsPost.findUnique({ where: { id } });
    if (!post || post.destination !== WATCH_DESTINATION)
      throw new NotFoundException('Watched post not found');
    return post;
  }

  private link(input: unknown) {
    try {
      return normalizeWatchUrl(input);
    } catch {
      throw new BadRequestException(
        'Use a full https://www.threads.com/@username/post/code link',
      );
    }
  }
}
