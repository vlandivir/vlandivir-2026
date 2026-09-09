import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailExecutorService } from './email-executor.service';

describe('EmailExecutorService undo', () => {
  const message = {
    id: 42,
    account: 'personal',
    uid: 77n,
    subject: 'Hello',
    seen: true,
    archived: true,
    hidden: false,
    important: false,
    labels: [],
  };

  function setup(action: object | null) {
    const prisma = {
      emailActionLog: {
        findFirst: jest.fn().mockResolvedValue(action),
        create: jest.fn().mockResolvedValue({}),
      },
      emailMessage: {
        update: jest.fn(({ data }) => Promise.resolve({ ...message, ...data })),
      },
    };
    const config = { get: jest.fn().mockReturnValue('') };
    const service = new EmailExecutorService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    return { service, prisma };
  }

  it('offers the latest reversible action', async () => {
    const latest = {
      id: 11,
      action: 'mark_important',
      param: null,
      prevState: { important: false },
      message: { ...message, important: true },
    };
    const { service } = setup(latest);

    await expect(service.getLastUndoableAction()).resolves.toBe(latest);
  });

  it('offers nothing after the latest action was undone', async () => {
    const { service } = setup({
      id: 12,
      action: 'undo',
      param: '11',
      prevState: { important: true },
      message,
    });

    await expect(service.getLastUndoableAction()).resolves.toBeNull();
  });

  it('restores Inbox and unread state when undoing archive', async () => {
    const target = {
      id: 12,
      action: 'archive',
      param: null,
      prevState: {
        archived: false,
        labels: ['\\Inbox'],
        seen: false,
      },
      message,
    };
    const { service, prisma } = setup(target);
    const client = {
      messageFlagsAdd: jest.fn().mockResolvedValue(true),
      messageFlagsRemove: jest.fn().mockResolvedValue(true),
    };
    Object.assign(service, {
      imap: jest.fn((_account, fn) => fn(client)),
    });

    const result = await service.undoLastManualAction();

    expect(client.messageFlagsAdd).toHaveBeenCalledWith('77', ['\\Inbox'], {
      uid: true,
      useLabels: true,
    });
    expect(client.messageFlagsRemove).toHaveBeenCalledWith('77', ['\\Seen'], {
      uid: true,
    });
    expect(prisma.emailMessage.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { archived: false, labels: ['\\Inbox'], seen: false },
    });
    expect(prisma.emailActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: 42,
        action: 'undo',
        param: '12',
        result: 'ok',
      }),
    });
    expect(result.message).toMatchObject({
      archived: false,
      seen: false,
      labels: ['\\Inbox'],
    });
  });

  it('restores only the label changed by the original action', async () => {
    const target = {
      id: 13,
      action: 'label',
      param: 'agent/work',
      prevState: { labels: ['other'] },
      message: { ...message, labels: ['other', 'agent/work', 'later'] },
    };
    const { service, prisma } = setup(target);
    const client = {
      messageFlagsAdd: jest.fn().mockResolvedValue(true),
      messageFlagsRemove: jest.fn().mockResolvedValue(true),
    };
    Object.assign(service, {
      imap: jest.fn((_account, fn) => fn(client)),
    });

    await service.undoLastManualAction();

    expect(client.messageFlagsRemove).toHaveBeenCalledWith(
      '77',
      ['agent/work'],
      { uid: true, useLabels: true },
    );
    expect(prisma.emailMessage.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { labels: ['other', 'later'] },
    });
  });
});
