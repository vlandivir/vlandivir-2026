import { GtdIdentityProvider, GtdTaskStatus } from '../generated/prisma-client';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../services/storage.service';
import { GtdService } from './gtd.service';

describe('GtdService', () => {
  const prisma = {} as PrismaService;
  const storage = {} as StorageService;
  const service = new GtdService(prisma, storage);
  const snoozeUntil = (action: string, now: Date): Date =>
    (
      service as unknown as {
        snoozeUntil(action: string, now: Date): Date;
      }
    ).snoozeUntil(action, now);

  it('calculates hour and day snooze presets', () => {
    const now = new Date('2026-07-31T20:15:00.000Z');
    expect(snoozeUntil('SNOOZE_HOUR', now).toISOString()).toBe(
      '2026-07-31T21:15:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_HOURS_2', now).toISOString()).toBe(
      '2026-07-31T22:15:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_HOURS_4', now).toISOString()).toBe(
      '2026-08-01T00:15:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_TOMORROW', now).toISOString()).toBe(
      '2026-08-01T09:00:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_DAYS_2', now).toISOString()).toBe(
      '2026-08-02T09:00:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_DAYS_7', now).toISOString()).toBe(
      '2026-08-07T09:00:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_DAYS_14', now).toISOString()).toBe(
      '2026-08-14T09:00:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_DAYS_30', now).toISOString()).toBe(
      '2026-08-30T09:00:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_MONDAY', now).toISOString()).toBe(
      '2026-08-03T09:00:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_FRIDAY', now).toISOString()).toBe(
      '2026-08-07T09:00:00.000Z',
    );
    expect(snoozeUntil('SNOOZE_SUNDAY', now).toISOString()).toBe(
      '2026-08-02T09:00:00.000Z',
    );
  });

  it('uses the same Monday when 09:00 UTC is still in the future', () => {
    const now = new Date('2026-08-03T08:15:00.000Z');
    expect(snoozeUntil('SNOOZE_MONDAY', now).toISOString()).toBe(
      '2026-08-03T09:00:00.000Z',
    );
  });

  it('snoozes to next evening at 20:00 Europe/Berlin', () => {
    // Summer (CEST, UTC+2): 20:00 → 18:00Z
    expect(
      snoozeUntil(
        'SNOOZE_EVENING',
        new Date('2026-08-06T10:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-08-06T18:00:00.000Z');
    expect(
      snoozeUntil(
        'SNOOZE_EVENING',
        new Date('2026-08-06T18:30:00.000Z'),
      ).toISOString(),
    ).toBe('2026-08-07T18:00:00.000Z');
    // Winter (CET, UTC+1): 20:00 → 19:00Z
    expect(
      snoozeUntil(
        'SNOOZE_EVENING',
        new Date('2026-01-15T10:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-01-15T19:00:00.000Z');
  });

  it('serializes orderKey on act so Nest can JSON-encode the response', async () => {
    const updatedTask = {
      id: 'task-1',
      workspaceId: 'ws',
      orderKey: 42n,
      status: GtdTaskStatus.COMPLETED,
      content: 'done',
    };
    const mockPrisma = {
      gtdTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          workspaceId: 'ws',
          status: GtdTaskStatus.ACTIVE,
        }),
      },
      $transaction: jest.fn().mockResolvedValue(updatedTask),
    } as unknown as PrismaService;
    const actService = new GtdService(mockPrisma, storage);

    const result = await actService.act('ws', 'task-1', 'COMPLETE');

    expect(result.orderKey).toBe('42');
    expect(typeof result.orderKey).toBe('string');
    // Regression: raw bigint breaks Express/Nest res.json with a 500
    // after the DB write already succeeded.
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('creates new tasks at the front of the queue', async () => {
    const created = {
      id: 'new',
      workspaceId: 'ws',
      orderKey: 4n,
      content: 'fresh',
      project: null,
      attachments: [],
    };
    const taskCreate = jest.fn().mockResolvedValue(created);
    const tx = {
      gtdWorkspace: {
        update: jest.fn().mockResolvedValue({ id: 'ws' }),
      },
      gtdTask: {
        aggregate: jest.fn().mockResolvedValue({ _min: { orderKey: 5n } }),
        create: taskCreate,
      },
    };
    const mockPrisma = {
      gtdProject: { findFirst: jest.fn() },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const createService = new GtdService(mockPrisma, storage);

    const result = await createService.createTask('ws', 'fresh');

    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderKey: 4n, content: 'fresh' }),
      }),
    );
    expect(result.orderKey).toBe('4');
  });

  it('uses nextOrder when creating the first task in a workspace', async () => {
    const created = {
      id: 'first',
      workspaceId: 'ws',
      orderKey: 1n,
      content: 'only',
      project: null,
      attachments: [],
    };
    const taskCreate = jest.fn().mockResolvedValue(created);
    const tx = {
      gtdWorkspace: {
        update: jest
          .fn()
          .mockResolvedValueOnce({ id: 'ws' })
          .mockResolvedValueOnce({ nextOrder: 1n }),
      },
      gtdTask: {
        aggregate: jest.fn().mockResolvedValue({ _min: { orderKey: null } }),
        create: taskCreate,
      },
    };
    const mockPrisma = {
      gtdProject: { findFirst: jest.fn() },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const createService = new GtdService(mockPrisma, storage);

    await createService.createTask('ws', 'only');

    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderKey: 1n }),
      }),
    );
  });

  it('merges Telegram tasks after the Google queue without losing order', async () => {
    const taskUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      gtdIdentity: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'google', provider: GtdIdentityProvider.GOOGLE },
          ])
          .mockResolvedValueOnce([
            { id: 'telegram', provider: GtdIdentityProvider.TELEGRAM },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      gtdTask: {
        findMany: jest.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]),
        update: taskUpdate,
      },
      gtdProject: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      gtdWorkspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ nextOrder: 3n }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      gtdLinkRequest: { update: jest.fn().mockResolvedValue({}) },
    };
    const mockPrisma = {
      gtdLinkRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'link',
          consumedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          telegramIdentity: {
            id: 'telegram',
            provider: GtdIdentityProvider.TELEGRAM,
            providerId: '42',
            workspaceId: 'telegram-workspace',
          },
        }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const mergeService = new GtdService(mockPrisma, storage);

    await mergeService.confirmLink(
      {
        workspaceId: 'google-workspace',
        identity: {
          id: 'google',
          workspaceId: 'google-workspace',
          provider: GtdIdentityProvider.GOOGLE,
          providerId: 'owner@example.com',
          displayName: 'Owner',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      'a'.repeat(64),
    );

    expect(taskUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 't1' },
      data: { workspaceId: 'google-workspace', orderKey: 4n },
    });
    expect(taskUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 't2' },
      data: { workspaceId: 'google-workspace', orderKey: 5n },
    });
    expect(tx.gtdWorkspace.delete).toHaveBeenCalledWith({
      where: { id: 'telegram-workspace' },
    });
  });

  it('parses dueDate as midnight UTC and rejects invalid values', () => {
    const parseDueDate = (value: unknown): Date | null =>
      (
        service as unknown as {
          parseDueDate(value: unknown): Date | null;
        }
      ).parseDueDate(value);

    expect(parseDueDate(null)).toBeNull();
    expect(parseDueDate('')).toBeNull();
    expect(parseDueDate('2026-08-04')?.toISOString()).toBe(
      '2026-08-04T00:00:00.000Z',
    );
    expect(() => parseDueDate('04-08-2026')).toThrow(
      'dueDate must be YYYY-MM-DD',
    );
    expect(() => parseDueDate('2026-02-30')).toThrow(
      'dueDate is not a valid calendar date',
    );
  });

  it('filters the today scope to due today and overdue in UTC', () => {
    const scopeWhere = (
      scope: { kind: string; projectId?: string },
      now: Date,
    ) =>
      (
        service as unknown as {
          scopeWhere(
            scope: { kind: string; projectId?: string },
            now: Date,
          ): Record<string, unknown>;
        }
      ).scopeWhere(scope, now);

    expect(
      scopeWhere({ kind: 'today' }, new Date('2026-08-04T15:30:00.000Z')),
    ).toEqual({
      dueDate: { not: null, lt: new Date('2026-08-05T00:00:00.000Z') },
    });
    expect(scopeWhere({ kind: 'inbox' }, new Date())).toEqual({
      projectId: null,
    });
  });

  it('lists ACTIVE tasks for sync with optional updatedSince', async () => {
    const updatedAt = new Date('2026-08-08T12:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 't1',
        workspaceId: 'ws',
        orderKey: 1n,
        status: GtdTaskStatus.ACTIVE,
        content: 'a',
        dueDate: null,
        snoozedUntil: null,
        completedAt: null,
        canceledAt: null,
        createdAt: updatedAt,
        updatedAt,
        project: null,
        attachments: [],
      },
    ]);
    const mockPrisma = {
      gtdTask: { findMany },
    } as unknown as PrismaService;
    const syncService = new GtdService(mockPrisma, storage);

    const result = await syncService.listTasks('ws', {
      updatedSince: '2026-08-08T11:00:00.000Z',
      limit: 50,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws',
          status: GtdTaskStatus.ACTIVE,
          updatedAt: { gt: new Date('2026-08-08T11:00:00.000Z') },
        },
        take: 51,
      }),
    );
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].orderKey).toBe('1');
    expect(result.nextCursor).toBeNull();
  });

  it('stores context as a markdown attachment', async () => {
    const uploadPrivateFileWithKey = jest.fn().mockResolvedValue(undefined);
    const mockStorage = { uploadPrivateFileWithKey } as unknown as StorageService;
    const mockPrisma = {
      gtdTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          workspaceId: 'ws',
          status: GtdTaskStatus.ACTIVE,
          content: 'short',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'task-1',
          workspaceId: 'ws',
          orderKey: 1n,
          content: 'short',
          status: GtdTaskStatus.ACTIVE,
          dueDate: null,
          snoozedUntil: null,
          completedAt: null,
          canceledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          project: null,
          attachments: [
            {
              id: 'att-1',
              originalName: 'ticket.md',
              mimeType: 'text/markdown',
              size: 12,
              description: null,
            },
          ],
        }),
      },
      gtdAttachment: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const contextService = new GtdService(mockPrisma, mockStorage);

    const result = await contextService.addContext('ws', 'task-1', {
      name: 'ticket',
      text: 'длинный тикет',
    });

    expect(uploadPrivateFileWithKey).toHaveBeenCalled();
    expect(result.attachments[0].originalName).toBe('ticket.md');
    expect(result.attachments[0].mimeType).toBe('text/markdown');
  });
});
