import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailApiController } from './email-api.controller';

describe('EmailApiController thread actions', () => {
  function setup() {
    const prisma = {
      emailMessage: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ account: 'work', threadId: 7 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 501 }]),
      },
    };
    const executor = {
      apply: jest.fn((id: number) =>
        Promise.resolve({
          id,
          seen: false,
          important: true,
          hidden: false,
          archived: false,
          labels: ['agent/work'],
          uid: 77n, // Must not leak non-JSON fields into the response.
        }),
      ),
    };
    const controller = Object.create(
      EmailApiController.prototype,
    ) as EmailApiController;
    Object.assign(controller, { prisma, emailExecutorService: executor });
    return { controller, prisma, executor };
  }

  it('resolves every member by account and thread without a list limit', async () => {
    const { controller, prisma, executor } = setup();
    const result = await controller.threadAction(2, {
      action: 'mark_important',
    });

    expect(prisma.emailMessage.findMany).toHaveBeenCalledWith({
      where: { account: 'work', threadId: 7 },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(executor.apply.mock.calls).toEqual([
      [1, 'mark_important', undefined],
      [2, 'mark_important', undefined],
      [501, 'mark_important', undefined],
    ]);
    expect(result.messages.map((message) => message.id)).toEqual([1, 2, 501]);
    expect(result.failedIds).toEqual([]);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('continues after an individual failure and reports only failed ids', async () => {
    const { controller, executor } = setup();
    executor.apply.mockRejectedValueOnce(new Error('IMAP unavailable'));

    const result = await controller.threadAction(2, { action: 'archive' });

    expect(result.failedIds).toEqual([1]);
    expect(result.messages.map((message) => message.id)).toEqual([2, 501]);
    expect(executor.apply).toHaveBeenCalledTimes(3);
  });

  it('passes the selected label to every member', async () => {
    const { controller, executor } = setup();
    await controller.threadAction(2, { action: 'label', param: 'agent/work' });
    expect(executor.apply).toHaveBeenLastCalledWith(501, 'label', 'agent/work');
  });

  it.each([
    { action: 'delete' },
    { action: 'label' },
    { action: 'unlabel', param: '   ' },
  ])('rejects invalid input before applying anything: %j', async (body) => {
    const { controller, executor, prisma } = setup();
    await expect(controller.threadAction(2, body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(executor.apply).not.toHaveBeenCalled();
    expect(prisma.emailMessage.findMany).not.toHaveBeenCalled();
  });

  it('rejects a missing anchor message', async () => {
    const { controller, prisma, executor } = setup();
    prisma.emailMessage.findUnique.mockResolvedValue(null);
    await expect(
      controller.threadAction(999, { action: 'hide' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(executor.apply).not.toHaveBeenCalled();
  });
});
