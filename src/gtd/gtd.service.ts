import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  GtdIdentityProvider,
  GtdTaskEventType,
  GtdTaskStatus,
  type Prisma,
} from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DESCRIBE_FAILURE_SENTINELS,
  LlmService,
} from '../services/llm.service';
import { StorageService } from '../services/storage.service';
import type { GtdAuthContext } from './gtd-auth.service';
import { GtdSearchService } from './gtd-search.service';
import {
  GTD_MAX_CONTEXT_CHARS,
  contextMimeForName,
  isGtdTextMime,
  sanitizeContextName,
} from './gtd-text';

const MAX_CONTENT = 10_000;
const MAX_PROJECT_NAME = 120;
export const GTD_MAX_ATTACHMENTS = 10;
export const GTD_MAX_FILE_BYTES = 20 * 1024 * 1024;
type Scope = {
  kind: 'all' | 'inbox' | 'project' | 'today';
  projectId?: string;
};
export type GtdAction =
  | 'ROTATE'
  | 'SNOOZE_HOUR'
  | 'SNOOZE_HOURS_2'
  | 'SNOOZE_HOURS_4'
  | 'SNOOZE_EVENING'
  | 'SNOOZE_TOMORROW'
  | 'SNOOZE_DAYS_2'
  | 'SNOOZE_DAYS_7'
  | 'SNOOZE_DAYS_14'
  | 'SNOOZE_DAYS_30'
  | 'SNOOZE_MONDAY'
  | 'SNOOZE_TUESDAY'
  | 'SNOOZE_WEDNESDAY'
  | 'SNOOZE_THURSDAY'
  | 'SNOOZE_FRIDAY'
  | 'SNOOZE_SATURDAY'
  | 'SNOOZE_SUNDAY'
  | 'COMPLETE'
  | 'CANCEL';

const GTD_SNOOZE_ACTIONS: GtdAction[] = [
  'SNOOZE_HOUR',
  'SNOOZE_HOURS_2',
  'SNOOZE_HOURS_4',
  'SNOOZE_EVENING',
  'SNOOZE_TOMORROW',
  'SNOOZE_DAYS_2',
  'SNOOZE_DAYS_7',
  'SNOOZE_DAYS_14',
  'SNOOZE_DAYS_30',
  'SNOOZE_MONDAY',
  'SNOOZE_TUESDAY',
  'SNOOZE_WEDNESDAY',
  'SNOOZE_THURSDAY',
  'SNOOZE_FRIDAY',
  'SNOOZE_SATURDAY',
  'SNOOZE_SUNDAY',
];

const WEEKDAY_SNOOZE: Partial<Record<GtdAction, number>> = {
  SNOOZE_SUNDAY: 0,
  SNOOZE_MONDAY: 1,
  SNOOZE_TUESDAY: 2,
  SNOOZE_WEDNESDAY: 3,
  SNOOZE_THURSDAY: 4,
  SNOOZE_FRIDAY: 5,
  SNOOZE_SATURDAY: 6,
};

const DAY_OFFSET_SNOOZE: Partial<Record<GtdAction, number>> = {
  SNOOZE_TOMORROW: 1,
  SNOOZE_DAYS_2: 2,
  SNOOZE_DAYS_7: 7,
  SNOOZE_DAYS_14: 14,
  SNOOZE_DAYS_30: 30,
};

const HOUR_OFFSET_SNOOZE: Partial<Record<GtdAction, number>> = {
  SNOOZE_HOUR: 1,
  SNOOZE_HOURS_2: 2,
  SNOOZE_HOURS_4: 4,
};

const EUROPE_BERLIN = 'Europe/Berlin';
const MORNING_UTC_HOUR = 9;
const EVENING_CET_HOUR = 20;

@Injectable()
export class GtdService {
  private readonly logger = new Logger(GtdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Optional() private readonly llm?: LlmService,
    @Optional() private readonly search?: GtdSearchService,
  ) {}
  private readonly taskInclude = {
    project: true,
    attachments: { orderBy: { createdAt: 'asc' as const } },
  };

  async bootstrap(auth: GtdAuthContext, scope: Scope) {
    const now = new Date();
    const scopeWhere = this.scopeWhere(scope, now);
    if (scope.kind === 'project')
      await this.requireProject(auth.workspaceId, scope.projectId || '', false);
    const eligible = {
      workspaceId: auth.workspaceId,
      status: GtdTaskStatus.ACTIVE,
      ...scopeWhere,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    };
    const taskOrder =
      scope.kind === 'today'
        ? ([
            { dueDate: 'asc' },
            { orderKey: 'asc' },
            { id: 'asc' },
          ] as Prisma.GtdTaskOrderByWithRelationInput[])
        : ([
            { orderKey: 'asc' },
            { id: 'asc' },
          ] as Prisma.GtdTaskOrderByWithRelationInput[]);
    const [workspace, projects, current, availableCount, activeCount, next] =
      await Promise.all([
        this.prisma.gtdWorkspace.findUniqueOrThrow({
          where: { id: auth.workspaceId },
          include: {
            identities: { select: { provider: true, displayName: true } },
          },
        }),
        this.prisma.gtdProject.findMany({
          where: { workspaceId: auth.workspaceId },
          orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
        }),
        this.prisma.gtdTask.findFirst({
          where: eligible,
          orderBy: taskOrder,
          include: this.taskInclude,
        }),
        this.prisma.gtdTask.count({ where: eligible }),
        this.prisma.gtdTask.count({
          where: {
            workspaceId: auth.workspaceId,
            status: GtdTaskStatus.ACTIVE,
            ...scopeWhere,
          },
        }),
        this.prisma.gtdTask.findFirst({
          where: {
            workspaceId: auth.workspaceId,
            status: GtdTaskStatus.ACTIVE,
            ...scopeWhere,
            snoozedUntil: { gt: now },
          },
          orderBy: { snoozedUntil: 'asc' },
          select: { snoozedUntil: true },
        }),
      ]);
    return {
      identity: {
        provider: auth.identity.provider,
        displayName: auth.identity.displayName,
        linked: workspace.identities.length > 1,
        providers: workspace.identities.map((item) => item.provider),
      },
      projects: projects.map((project) => ({
        ...project,
        archived: Boolean(project.archivedAt),
      })),
      currentTask: current ? this.serializeTask(current) : null,
      counts: { available: availableCount, active: activeCount },
      nextWakeAt: next?.snoozedUntil?.toISOString() || null,
    };
  }

  createProject(workspaceId: string, nameValue: unknown) {
    return this.prisma.gtdProject.create({
      data: { workspaceId, name: this.projectName(nameValue) },
    });
  }

  async updateProject(
    workspaceId: string,
    projectId: string,
    body: { name?: unknown; archived?: unknown },
  ) {
    const project = await this.requireProject(workspaceId, projectId, true);
    const data: Prisma.GtdProjectUpdateInput = {};
    if (body.name !== undefined) data.name = this.projectName(body.name);
    if (body.archived !== undefined) {
      if (typeof body.archived !== 'boolean')
        throw new BadRequestException('archived must be boolean');
      data.archivedAt = body.archived ? new Date() : null;
    }
    if (!Object.keys(data).length)
      throw new BadRequestException('Nothing to update');
    return this.prisma.gtdProject.update({ where: { id: project.id }, data });
  }

  async createTask(
    workspaceId: string,
    contentValue: unknown,
    projectId?: unknown,
    dueDateValue?: unknown,
    context?: { name?: unknown; text?: unknown },
  ) {
    const content = this.content(contentValue);
    const project = await this.optionalActiveProject(workspaceId, projectId);
    const dueDate =
      dueDateValue === undefined ? null : this.parseDueDate(dueDateValue);
    const created = await this.prisma.$transaction(async (tx) => {
      const orderKey = await this.frontOrder(tx, workspaceId);
      const task = await tx.gtdTask.create({
        data: {
          workspaceId,
          projectId: project?.id,
          content,
          dueDate,
          orderKey,
          events: { create: { type: GtdTaskEventType.CREATED } },
        },
        include: this.taskInclude,
      });
      return this.serializeTask(task);
    });
    if (
      context?.text !== undefined &&
      context.text !== null &&
      context.text !== ''
    ) {
      return this.addContext(workspaceId, created.id, context);
    }
    this.scheduleIndex(workspaceId, created.id);
    return created;
  }

  async updateTask(
    workspaceId: string,
    taskId: string,
    body: { content?: unknown; projectId?: unknown; dueDate?: unknown },
  ) {
    const task = await this.requireTask(workspaceId, taskId, true);
    const data: Prisma.GtdTaskUpdateInput = {};
    const events: Prisma.GtdTaskEventCreateWithoutTaskInput[] = [];
    if (body.content !== undefined) {
      const content = this.content(body.content);
      data.content = content;
      if (content !== task.content)
        events.push({
          type: GtdTaskEventType.UPDATED,
          metadata: { previousContent: task.content },
        });
    }
    if (body.projectId !== undefined) {
      const requestedProjectId =
        body.projectId === null || body.projectId === ''
          ? null
          : body.projectId;
      if (
        requestedProjectId !== null &&
        typeof requestedProjectId !== 'string'
      ) {
        throw new BadRequestException('projectId must be a string or null');
      }
      if (requestedProjectId !== task.projectId) {
        const project = await this.optionalActiveProject(
          workspaceId,
          requestedProjectId,
        );
        const nextProjectId = project?.id || null;
        data.project = nextProjectId
          ? { connect: { id: nextProjectId } }
          : { disconnect: true };
        events.push({
          type: GtdTaskEventType.PROJECT_CHANGED,
          metadata: {
            previousProjectId: task.projectId,
            projectId: nextProjectId,
          },
        });
      }
    }
    if (body.dueDate !== undefined) {
      const dueDate = this.parseDueDate(body.dueDate);
      const previous = task.dueDate?.toISOString() || null;
      const next = dueDate?.toISOString() || null;
      if (previous !== next) {
        data.dueDate = dueDate;
        events.push({
          type: GtdTaskEventType.UPDATED,
          metadata: { previousDueDate: previous, dueDate: next },
        });
      }
    }
    if (!Object.keys(data).length)
      throw new BadRequestException('Nothing to update');
    const updated = await this.prisma.gtdTask.update({
      where: { id: task.id },
      data: { ...data, events: events.length ? { create: events } : undefined },
      include: this.taskInclude,
    });
    this.scheduleIndex(workspaceId, updated.id);
    return this.serializeTask(updated);
  }

  async act(workspaceId: string, taskId: string, actionValue: unknown) {
    const action = String(actionValue || '') as GtdAction;
    const allowed: GtdAction[] = [
      'ROTATE',
      ...GTD_SNOOZE_ACTIONS,
      'COMPLETE',
      'CANCEL',
    ];
    if (!allowed.includes(action))
      throw new BadRequestException('Invalid action');
    await this.requireTask(workspaceId, taskId, true);
    const now = new Date();
    // Must serialize: Prisma returns orderKey as bigint, and Nest JSON
    // serialization throws "Do not know how to serialize a BigInt" → 500
    // even though the DB write already succeeded (hence the UI toast).
    const updated = await this.prisma.$transaction(async (tx) => {
      if (action === 'ROTATE')
        return tx.gtdTask.update({
          where: { id: taskId },
          data: {
            orderKey: await this.nextOrder(tx, workspaceId),
            events: { create: { type: GtdTaskEventType.ROTATED } },
          },
        });
      if (action.startsWith('SNOOZE_')) {
        const until = this.snoozeUntil(action, now);
        return tx.gtdTask.update({
          where: { id: taskId },
          data: {
            snoozedUntil: until,
            events: {
              create: {
                type: GtdTaskEventType.SNOOZED,
                metadata: { preset: action, until: until.toISOString() },
              },
            },
          },
        });
      }
      return tx.gtdTask.update({
        where: { id: taskId },
        data:
          action === 'COMPLETE'
            ? {
                status: GtdTaskStatus.COMPLETED,
                completedAt: now,
                events: { create: { type: GtdTaskEventType.COMPLETED } },
              }
            : {
                status: GtdTaskStatus.CANCELED,
                canceledAt: now,
                events: { create: { type: GtdTaskEventType.CANCELED } },
              },
      });
    });
    this.scheduleIndex(workspaceId, updated.id);
    return this.serializeTask(updated);
  }

  async taskDetails(workspaceId: string, taskId: string) {
    const task = await this.prisma.gtdTask.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        ...this.taskInclude,
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return {
      ...this.serializeTask(task),
      events: task.events,
      stats: {
        snoozed: task.events.filter(
          (event) => event.type === GtdTaskEventType.SNOOZED,
        ).length,
        rotated: task.events.filter(
          (event) => event.type === GtdTaskEventType.ROTATED,
        ).length,
      },
    };
  }

  async taskDetailsForAgent(workspaceId: string, taskId: string) {
    const details = await this.taskDetails(workspaceId, taskId);
    const contexts = await Promise.all(
      details.attachments
        .filter((attachment) => isGtdTextMime(attachment.mimeType))
        .map(async (attachment) => ({
          id: attachment.id,
          name: attachment.originalName,
          mimeType: attachment.mimeType,
          text: await this.readAttachmentText(attachment.storageKey),
        })),
    );
    return { ...details, contexts };
  }

  async archive(workspaceId: string, cursor?: string, status?: string) {
    const where: Prisma.GtdTaskWhereInput = {
      workspaceId,
      status:
        status === 'COMPLETED'
          ? GtdTaskStatus.COMPLETED
          : status === 'CANCELED'
            ? GtdTaskStatus.CANCELED
            : { in: [GtdTaskStatus.COMPLETED, GtdTaskStatus.CANCELED] },
    };
    const tasks = await this.prisma.gtdTask.findMany({
      where,
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: { project: true, attachments: true },
    });
    const hasMore = tasks.length > 20;
    const page = hasMore ? tasks.slice(0, 20) : tasks;
    return {
      tasks: page.map((task) => this.serializeTask(task)),
      nextCursor: hasMore ? page.at(-1)?.id || null : null,
    };
  }

  /**
   * Paginated task dump for native/offline sync.
   * Default: ACTIVE tasks (including snoozed). Optional updatedSince filters by updatedAt.
   */
  async listTasks(
    workspaceId: string,
    options: {
      status?: string;
      updatedSince?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    const take = Math.min(Math.max(options.limit ?? 100, 1), 200);
    const statusFilter =
      options.status === 'COMPLETED'
        ? GtdTaskStatus.COMPLETED
        : options.status === 'CANCELED'
          ? GtdTaskStatus.CANCELED
          : options.status === 'ALL'
            ? undefined
            : GtdTaskStatus.ACTIVE;

    const where: Prisma.GtdTaskWhereInput = {
      workspaceId,
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    if (options.updatedSince) {
      const since = new Date(options.updatedSince);
      if (Number.isNaN(since.getTime())) {
        throw new BadRequestException('updatedSince must be an ISO datetime');
      }
      where.updatedAt = { gt: since };
    }

    const tasks = await this.prisma.gtdTask.findMany({
      where,
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      include: this.taskInclude,
    });
    const hasMore = tasks.length > take;
    const page = hasMore ? tasks.slice(0, take) : tasks;
    return {
      tasks: page.map((task) => this.serializeTask(task)),
      nextCursor: hasMore ? page.at(-1)?.id || null : null,
    };
  }

  async listProjects(workspaceId: string, updatedSince?: string) {
    const where: Prisma.GtdProjectWhereInput = { workspaceId };
    if (updatedSince) {
      const since = new Date(updatedSince);
      if (Number.isNaN(since.getTime())) {
        throw new BadRequestException('updatedSince must be an ISO datetime');
      }
      where.updatedAt = { gt: since };
    }
    const projects = await this.prisma.gtdProject.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    });
    return {
      projects: projects.map((project) => ({
        ...project,
        archived: Boolean(project.archivedAt),
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        archivedAt: project.archivedAt?.toISOString() || null,
      })),
    };
  }

  async searchTasks(
    workspaceId: string,
    query: string | undefined,
    options: { status?: 'active' | 'done' | 'all'; limit?: number } = {},
  ) {
    if (!this.search) {
      throw new BadRequestException('GTD search is unavailable');
    }
    const hits = await this.search.search(workspaceId, query, options);
    return hits.map((hit) => ({
      ...this.serializeTask(hit.task),
      similarity: hit.similarity,
    }));
  }

  async addContext(
    workspaceId: string,
    taskId: string,
    body: { name?: unknown; text?: unknown },
  ) {
    if (typeof body.text !== 'string' || !body.text.trim()) {
      throw new BadRequestException('text is required');
    }
    if (body.text.length > GTD_MAX_CONTEXT_CHARS) {
      throw new BadRequestException(
        `text must be at most ${GTD_MAX_CONTEXT_CHARS} characters`,
      );
    }
    const originalName = sanitizeContextName(body.name);
    const buffer = Buffer.from(body.text, 'utf8');
    return this.addAttachment(workspaceId, taskId, {
      buffer,
      mimetype: contextMimeForName(originalName),
      originalname: originalName,
      size: buffer.length,
    });
  }

  async addAttachment(
    workspaceId: string,
    taskId: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    const taskRow = await this.requireTask(workspaceId, taskId, true);
    if (!this.allowedMime(file.mimetype))
      throw new BadRequestException('Unsupported file type');
    if (file.size <= 0 || file.size > GTD_MAX_FILE_BYTES)
      throw new BadRequestException('File is too large');
    if (
      (await this.prisma.gtdAttachment.count({ where: { taskId } })) >=
      GTD_MAX_ATTACHMENTS
    )
      throw new BadRequestException('Attachment limit reached');
    const safeName =
      file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-180) || 'file';
    const storageKey = `gtd/${workspaceId}/${taskId}/${randomUUID()}-${safeName}`;
    await this.storage.uploadPrivateFileWithKey(
      file.buffer,
      file.mimetype,
      storageKey,
    );
    const description = await this.describeImageAttachment(
      file,
      taskRow.content,
    );
    const task = await this.prisma.gtdTask.update({
      where: { id: taskId },
      data: {
        attachments: {
          create: {
            storageKey,
            originalName: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            size: file.size,
            description,
          },
        },
        events: {
          create: {
            type: GtdTaskEventType.ATTACHMENT_ADDED,
            metadata: { originalName: file.originalname, size: file.size },
          },
        },
      },
      include: this.taskInclude,
    });
    this.scheduleIndex(workspaceId, taskId);
    return this.serializeTask(task);
  }

  async downloadAttachment(workspaceId: string, attachmentId: string) {
    const attachment = await this.prisma.gtdAttachment.findFirst({
      where: { id: attachmentId, task: { workspaceId } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return {
      attachment,
      buffer: await this.storage.downloadByKey(attachment.storageKey),
    };
  }

  async startLink(auth: GtdAuthContext, baseUrl: string) {
    if (auth.identity.provider !== GtdIdentityProvider.TELEGRAM)
      throw new BadRequestException('Start linking from Telegram');
    const identities = await this.prisma.gtdIdentity.findMany({
      where: { workspaceId: auth.workspaceId },
    });
    if (
      identities.some(
        (identity) => identity.provider === GtdIdentityProvider.GOOGLE,
      )
    )
      return { linked: true, authUrl: null };
    const token = randomBytes(32).toString('hex');
    await this.prisma.gtdLinkRequest.create({
      data: {
        tokenHash: this.hashToken(token),
        telegramIdentityId: auth.identity.id,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const redirect = `/gtd/link?token=${encodeURIComponent(token)}`;
    return {
      linked: false,
      authUrl: `${baseUrl}/auth/google?redirect=${encodeURIComponent(redirect)}`,
    };
  }

  async linkPreview(auth: GtdAuthContext, token: string) {
    this.requireGoogle(auth);
    const request = await this.validLinkRequest(token);
    return {
      google: auth.identity.displayName || auth.identity.providerId,
      telegram:
        request.telegramIdentity.displayName ||
        request.telegramIdentity.providerId,
      expiresAt: request.expiresAt.toISOString(),
    };
  }

  async confirmLink(auth: GtdAuthContext, token: string) {
    this.requireGoogle(auth);
    const request = await this.validLinkRequest(token, true);
    const telegramIdentity = request.telegramIdentity;
    if (request.consumedAt) {
      if (telegramIdentity.workspaceId === auth.workspaceId) {
        return { linked: true };
      }
      throw new BadRequestException('Link request is invalid or expired');
    }
    if (telegramIdentity.workspaceId === auth.workspaceId) {
      await this.prisma.gtdLinkRequest.update({
        where: { id: request.id },
        data: { consumedAt: new Date() },
      });
      return { linked: true };
    }
    await this.prisma.$transaction(async (tx) => {
      const targetIdentities = await tx.gtdIdentity.findMany({
        where: { workspaceId: auth.workspaceId },
      });
      if (
        targetIdentities.some(
          (identity) =>
            identity.provider === GtdIdentityProvider.TELEGRAM &&
            identity.id !== telegramIdentity.id,
        )
      )
        throw new ConflictException(
          'Google account is already linked to another Telegram account',
        );
      const sourceIdentities = await tx.gtdIdentity.findMany({
        where: { workspaceId: telegramIdentity.workspaceId },
      });
      if (
        sourceIdentities.some(
          (identity) => identity.provider === GtdIdentityProvider.GOOGLE,
        )
      )
        throw new ConflictException(
          'Telegram account is already linked to another Google account',
        );
      const sourceTasks = await tx.gtdTask.findMany({
        where: { workspaceId: telegramIdentity.workspaceId },
        orderBy: [{ orderKey: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      const target = await tx.gtdWorkspace.findUniqueOrThrow({
        where: { id: auth.workspaceId },
      });
      await tx.gtdProject.updateMany({
        where: { workspaceId: telegramIdentity.workspaceId },
        data: { workspaceId: auth.workspaceId },
      });
      let order = target.nextOrder;
      for (const task of sourceTasks) {
        order += 1n;
        await tx.gtdTask.update({
          where: { id: task.id },
          data: { workspaceId: auth.workspaceId, orderKey: order },
        });
      }
      await tx.gtdWorkspace.update({
        where: { id: auth.workspaceId },
        data: { nextOrder: order },
      });
      await tx.gtdIdentity.update({
        where: { id: telegramIdentity.id },
        data: { workspaceId: auth.workspaceId },
      });
      await tx.gtdLinkRequest.update({
        where: { id: request.id },
        data: { consumedAt: new Date() },
      });
      await tx.gtdWorkspace.delete({
        where: { id: telegramIdentity.workspaceId },
      });
    });
    return { linked: true };
  }

  serializeTask<
    T extends {
      orderKey: bigint;
      dueDate?: Date | null;
      snoozedUntil?: Date | null;
      completedAt?: Date | null;
      canceledAt?: Date | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
  >(task: T) {
    return {
      ...task,
      orderKey: task.orderKey.toString(),
      dueDate: task.dueDate?.toISOString() || null,
      snoozedUntil: task.snoozedUntil?.toISOString() || null,
      completedAt: task.completedAt?.toISOString() || null,
      canceledAt: task.canceledAt?.toISOString() || null,
      createdAt: task.createdAt?.toISOString(),
      updatedAt: task.updatedAt?.toISOString(),
    };
  }
  private scopeWhere(scope: Scope, now = new Date()): Prisma.GtdTaskWhereInput {
    if (scope.kind === 'inbox') return { projectId: null };
    if (scope.kind === 'project') return { projectId: scope.projectId };
    if (scope.kind === 'today') {
      // Calendar date in UTC: today + overdue (dueDate before tomorrow).
      return { dueDate: { not: null, lt: this.startOfUtcDay(now, 1) } };
    }
    return {};
  }
  /** Date-only deadline as midnight UTC. Accepts YYYY-MM-DD or null/'' to clear. */
  private parseDueDate(value: unknown): Date | null {
    if (value === null || value === '') return null;
    if (typeof value !== 'string')
      throw new BadRequestException('dueDate must be YYYY-MM-DD or null');
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) throw new BadRequestException('dueDate must be YYYY-MM-DD');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('dueDate is not a valid calendar date');
    }
    return date;
  }
  private startOfUtcDay(now: Date, dayOffset = 0) {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + dayOffset,
      ),
    );
  }
  private async nextOrder(tx: Prisma.TransactionClient, workspaceId: string) {
    return (
      await tx.gtdWorkspace.update({
        where: { id: workspaceId },
        data: { nextOrder: { increment: 1 } },
        select: { nextOrder: true },
      })
    ).nextOrder;
  }
  /** Place a new task before every existing one so it becomes current immediately. */
  private async frontOrder(tx: Prisma.TransactionClient, workspaceId: string) {
    // Serialize concurrent creates against the workspace row (same lock as nextOrder).
    await tx.gtdWorkspace.update({
      where: { id: workspaceId },
      data: { nextOrder: { increment: 0 } },
      select: { id: true },
    });
    const min = await tx.gtdTask.aggregate({
      where: { workspaceId },
      _min: { orderKey: true },
    });
    if (min._min.orderKey == null) return this.nextOrder(tx, workspaceId);
    return min._min.orderKey - 1n;
  }
  private content(value: unknown) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > MAX_CONTENT
    )
      throw new BadRequestException(
        `content must be 1-${MAX_CONTENT} characters`,
      );
    return value.trim();
  }
  private projectName(value: unknown) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > MAX_PROJECT_NAME
    )
      throw new BadRequestException(
        `name must be 1-${MAX_PROJECT_NAME} characters`,
      );
    return value.trim();
  }
  private async optionalActiveProject(workspaceId: string, value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string')
      throw new BadRequestException('projectId must be a string or null');
    return this.requireProject(workspaceId, value, false);
  }
  private async requireProject(
    workspaceId: string,
    projectId: string,
    allowArchived: boolean,
  ) {
    const project = await this.prisma.gtdProject.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (!allowArchived && project.archivedAt)
      throw new BadRequestException('Project is archived');
    return project;
  }
  private async requireTask(
    workspaceId: string,
    taskId: string,
    activeOnly: boolean,
  ) {
    const task = await this.prisma.gtdTask.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (activeOnly && task.status !== GtdTaskStatus.ACTIVE)
      throw new BadRequestException('Task is not active');
    return task;
  }
  private snoozeUntil(action: GtdAction, now: Date) {
    const hours = HOUR_OFFSET_SNOOZE[action];
    if (hours != null) return new Date(now.getTime() + hours * 3_600_000);
    if (action === 'SNOOZE_EVENING') return this.nextEveningCet(now);
    const dayOffset = DAY_OFFSET_SNOOZE[action];
    if (dayOffset != null) return this.morningUtc(now, dayOffset);
    const weekday = WEEKDAY_SNOOZE[action];
    if (weekday != null) return this.weekdayMorningUtc(now, weekday);
    throw new BadRequestException('Invalid snooze action');
  }

  /** Morning wake time: 09:00 UTC on the given UTC calendar day offset. */
  private morningUtc(now: Date, daysAhead: number) {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysAhead,
        MORNING_UTC_HOUR,
      ),
    );
  }

  /** Next occurrence of weekday at 09:00 UTC (0=Sun … 6=Sat). */
  private weekdayMorningUtc(now: Date, targetWeekday: number) {
    const candidate = this.morningUtc(now, 0);
    candidate.setUTCDate(
      candidate.getUTCDate() +
        ((targetWeekday - candidate.getUTCDay() + 7) % 7),
    );
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 7);
    return candidate;
  }

  /** Next 20:00 Europe/Berlin (CET/CEST). */
  private nextEveningCet(now: Date) {
    const parts = this.zonedParts(now, EUROPE_BERLIN);
    let candidate = this.instantAtZone(
      EUROPE_BERLIN,
      parts.year,
      parts.month,
      parts.day,
      EVENING_CET_HOUR,
      0,
    );
    if (candidate <= now) {
      const noon = this.instantAtZone(
        EUROPE_BERLIN,
        parts.year,
        parts.month,
        parts.day,
        12,
        0,
      );
      const next = this.zonedParts(
        new Date(noon.getTime() + 86_400_000),
        EUROPE_BERLIN,
      );
      candidate = this.instantAtZone(
        EUROPE_BERLIN,
        next.year,
        next.month,
        next.day,
        EVENING_CET_HOUR,
        0,
      );
    }
    return candidate;
  }

  private zonedParts(date: Date, timeZone: string) {
    const map = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    ) as Record<string, string>;
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
    };
  }

  /** UTC instant for a wall-clock time in `timeZone`. */
  private instantAtZone(
    timeZone: string,
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
  ) {
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let guess = desiredAsUtc;
    for (let i = 0; i < 3; i += 1) {
      const parts = this.zonedParts(new Date(guess), timeZone);
      const asUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
      guess -= asUtc - desiredAsUtc;
    }
    return new Date(guess);
  }
  private allowedMime(mime: string) {
    return (
      [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/avif',
        'image/heic',
        'image/heif',
      ].includes(mime) ||
      [
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'video/x-m4v',
        'video/3gpp',
      ].includes(mime) ||
      [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ].includes(mime)
    );
  }
  private scheduleIndex(workspaceId: string, taskId: string) {
    void this.search?.indexTask(workspaceId, taskId).catch((error) => {
      this.logger.warn(
        `GTD index failed for ${taskId}: ${String(error)}`,
      );
    });
  }

  private async describeImageAttachment(
    file: { buffer: Buffer; mimetype: string },
    taskContent: string,
  ): Promise<string | null> {
    if (!file.mimetype.startsWith('image/') || !this.llm) return null;
    try {
      const description = await this.llm.describeImage(
        file.buffer,
        undefined,
        taskContent,
      );
      const trimmed = description.trim();
      if (
        !trimmed ||
        (DESCRIBE_FAILURE_SENTINELS as readonly string[]).includes(trimmed)
      ) {
        return null;
      }
      return trimmed;
    } catch (error) {
      this.logger.warn(`GTD image describe failed: ${String(error)}`);
      return null;
    }
  }

  private async readAttachmentText(storageKey: string): Promise<string | null> {
    try {
      const buffer = await this.storage.downloadByKey(storageKey);
      return buffer.toString('utf8');
    } catch (error) {
      this.logger.warn(
        `Could not read GTD attachment ${storageKey}: ${String(error)}`,
      );
      return null;
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private async validLinkRequest(token: string, allowConsumed = false) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new BadRequestException('Invalid link token');
    const request = await this.prisma.gtdLinkRequest.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { telegramIdentity: true },
    });
    if (
      !request ||
      (!allowConsumed && request.consumedAt) ||
      request.expiresAt <= new Date()
    )
      throw new BadRequestException('Link request is invalid or expired');
    return request;
  }
  private requireGoogle(auth: GtdAuthContext) {
    if (auth.identity.provider !== GtdIdentityProvider.GOOGLE)
      throw new BadRequestException('Google authentication required');
  }
}
