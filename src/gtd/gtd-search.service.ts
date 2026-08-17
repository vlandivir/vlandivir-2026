import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { StorageService } from '../services/storage.service';
import {
  GTD_INDEX_CHARS,
  buildGtdIndexText,
  isGtdTextMime,
} from './gtd-text';

export type GtdSearchStatus = 'active' | 'done' | 'all';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;
const MIN_SIMILARITY = 0.3;

@Injectable()
export class GtdSearchService {
  private readonly logger = new Logger(GtdSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly storage: StorageService,
  ) {}

  async indexTask(workspaceId: string, taskId: string): Promise<void> {
    const task = await this.prisma.gtdTask.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        project: true,
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!task) {
      await this.prisma.$executeRaw`
        DELETE FROM "GtdEmbedding" WHERE "taskId" = ${taskId}
      `;
      return;
    }

    const attachments = await Promise.all(
      task.attachments.map(async (attachment) => ({
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        description: attachment.description,
        text: isGtdTextMime(attachment.mimeType)
          ? await this.readText(attachment.storageKey)
          : null,
      })),
    );
    const content = buildGtdIndexText({
      content: task.content,
      status: task.status,
      dueDate: task.dueDate,
      snoozedUntil: task.snoozedUntil,
      project: task.project,
      attachments,
    });
    if (!content.trim()) return;

    const embedding = await this.embeddings.embedText(
      content.slice(0, GTD_INDEX_CHARS),
    );
    const vector = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      INSERT INTO "GtdEmbedding" ("taskId", "workspaceId", "content", "embedding", "createdAt", "updatedAt")
      VALUES (${task.id}, ${workspaceId}, ${content}, ${vector}::vector, NOW(), NOW())
      ON CONFLICT ("taskId") DO UPDATE SET
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "workspaceId" = EXCLUDED."workspaceId",
        "updatedAt" = NOW()
    `;
  }

  async indexMissing(workspaceId: string): Promise<number> {
    const missing = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT t."id"
      FROM "GtdTask" t
      LEFT JOIN "GtdEmbedding" e ON e."taskId" = t."id"
      WHERE t."workspaceId" = ${workspaceId}
        AND e."taskId" IS NULL
      ORDER BY t."updatedAt" DESC
      LIMIT 50
    `;
    for (const row of missing) {
      try {
        await this.indexTask(workspaceId, row.id);
      } catch (error) {
        this.logger.warn(
          `GTD embedding failed for ${row.id}: ${String(error)}`,
        );
      }
    }
    if (missing.length) {
      this.logger.log(
        `Indexed ${missing.length} GTD tasks in workspace ${workspaceId}`,
      );
    }
    return missing.length;
  }

  async search(
    workspaceId: string,
    query: string | undefined,
    options: { status?: GtdSearchStatus; limit?: number } = {},
  ) {
    const status = options.status ?? 'active';
    const take = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const statusWhere = this.statusWhere(status);

    if (!query?.trim()) {
      const tasks = await this.prisma.gtdTask.findMany({
        where: { workspaceId, ...statusWhere },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take,
        include: {
          project: true,
          attachments: { orderBy: { createdAt: 'asc' } },
        },
      });
      return tasks.map((task) => ({ task, similarity: null as number | null }));
    }

    await this.indexMissing(workspaceId);

    const embedding = await this.embeddings.embedText(query.trim());
    const vector = `[${embedding.join(',')}]`;
    const statusFilter =
      status === 'active'
        ? Prisma.sql`AND t.status = 'ACTIVE'`
        : status === 'done'
          ? Prisma.sql`AND t.status IN ('COMPLETED', 'CANCELED')`
          : Prisma.empty;

    const hits = await this.prisma.$queryRaw<
      { taskId: string; similarity: number }[]
    >(Prisma.sql`
      SELECT e."taskId", 1 - (e."embedding" <=> ${vector}::vector) AS "similarity"
      FROM "GtdEmbedding" e
      JOIN "GtdTask" t ON t."id" = e."taskId"
      WHERE e."workspaceId" = ${workspaceId}
        ${statusFilter}
        AND 1 - (e."embedding" <=> ${vector}::vector) >= ${MIN_SIMILARITY}
      ORDER BY e."embedding" <=> ${vector}::vector
      LIMIT ${take}
    `);
    if (!hits.length) return [];

    const tasks = await this.prisma.gtdTask.findMany({
      where: { id: { in: hits.map((hit) => hit.taskId) }, workspaceId },
      include: {
        project: true,
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    const byId = new Map(tasks.map((task) => [task.id, task]));
    return hits.flatMap((hit) => {
      const task = byId.get(hit.taskId);
      if (!task) return [];
      return [{ task, similarity: Math.round(hit.similarity * 1000) / 1000 }];
    });
  }

  private statusWhere(status: GtdSearchStatus) {
    if (status === 'active') return { status: 'ACTIVE' as const };
    if (status === 'done') {
      return { status: { in: ['COMPLETED' as const, 'CANCELED' as const] } };
    }
    return {};
  }

  private async readText(storageKey: string): Promise<string | null> {
    try {
      const buffer = await this.storage.downloadByKey(storageKey);
      return buffer.toString('utf8').slice(0, GTD_INDEX_CHARS);
    } catch (error) {
      this.logger.warn(
        `Could not read GTD attachment ${storageKey}: ${String(error)}`,
      );
      return null;
    }
  }
}
