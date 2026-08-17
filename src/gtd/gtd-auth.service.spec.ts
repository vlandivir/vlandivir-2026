import { parse, validate } from '@telegram-apps/init-data-node';
import type { AuthService } from '../auth/auth.service';
import { GtdIdentityProvider } from '../generated/prisma-client';
import type { PrismaService } from '../prisma/prisma.service';
import { GtdAuthService, newGtdMcpToken } from './gtd-auth.service';

jest.mock('@telegram-apps/init-data-node', () => ({
  validate: jest.fn(),
  parse: jest.fn(),
}));

describe('GtdAuthService', () => {
  const identityFind = jest.fn();
  const workspaceCreate = jest.fn();
  const workspaceFind = jest.fn();
  const prisma = {
    gtdIdentity: {
      findUnique: identityFind,
      update: jest.fn(),
    },
    gtdWorkspace: { create: workspaceCreate, findUnique: workspaceFind },
  } as unknown as PrismaService;
  const config = { get: jest.fn().mockReturnValue('bot-token') };

  beforeEach(() => jest.clearAllMocks());

  it('creates an independent workspace for an allowed Google session', async () => {
    const auth = {
      getSessionFromRequest: jest
        .fn()
        .mockReturnValue({ email: 'Owner@Example.com', name: 'Owner' }),
    } as unknown as AuthService;
    identityFind.mockResolvedValue(null);
    workspaceCreate.mockResolvedValue({
      id: 'google-workspace',
      identities: [
        {
          id: 'google-id',
          workspaceId: 'google-workspace',
          provider: GtdIdentityProvider.GOOGLE,
          providerId: 'owner@example.com',
          displayName: 'Owner',
        },
      ],
    });
    const service = new GtdAuthService(prisma, auth, config as never);

    const result = await service.authenticate({ headers: {} } as never);

    expect(result.workspaceId).toBe('google-workspace');
    expect(workspaceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          identities: {
            create: expect.objectContaining({
              provider: GtdIdentityProvider.GOOGLE,
              providerId: 'owner@example.com',
            }),
          },
          mcpToken: expect.stringMatching(/^gtd_[a-f0-9]{48}$/),
        }),
      }),
    );
  });

  it('creates an independent workspace from signed Telegram initData', async () => {
    const auth = {
      getSessionFromRequest: jest.fn().mockReturnValue(null),
    } as unknown as AuthService;
    (validate as jest.Mock).mockReturnValue(undefined);
    (parse as jest.Mock).mockReturnValue({
      user: { id: 42, firstName: 'Telegram', lastName: 'User' },
    });
    identityFind.mockResolvedValue(null);
    workspaceCreate.mockResolvedValue({
      id: 'telegram-workspace',
      identities: [
        {
          id: 'telegram-id',
          workspaceId: 'telegram-workspace',
          provider: GtdIdentityProvider.TELEGRAM,
          providerId: '42',
          displayName: 'Telegram User',
        },
      ],
    });
    const service = new GtdAuthService(prisma, auth, config as never);

    const result = await service.authenticate({
      headers: { 'x-telegram-init-data': 'signed-data' },
    } as never);

    expect(result.workspaceId).toBe('telegram-workspace');
    expect(validate).toHaveBeenCalledWith('signed-data', 'bot-token');
    expect(workspaceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          identities: {
            create: expect.objectContaining({
              provider: GtdIdentityProvider.TELEGRAM,
              providerId: '42',
            }),
          },
          mcpToken: expect.stringMatching(/^gtd_[a-f0-9]{48}$/),
        }),
      }),
    );
  });

  it('mints a gtd_ token of 48 hex chars', () => {
    expect(newGtdMcpToken()).toMatch(/^gtd_[a-f0-9]{48}$/);
  });

  it('resolves a workspace by its mcp token', async () => {
    workspaceFind.mockResolvedValue({ id: 'ws-1' });
    const service = new GtdAuthService(
      prisma,
      { getSessionFromRequest: jest.fn() } as unknown as AuthService,
      config as never,
    );

    await expect(
      service.findWorkspaceByMcpToken('gtd_' + 'ab'.repeat(24)),
    ).resolves.toEqual({ id: 'ws-1' });
    expect(workspaceFind).toHaveBeenCalledWith({
      where: { mcpToken: 'gtd_' + 'ab'.repeat(24) },
      select: { id: true },
    });
  });

  it('does not look up tokens without the gtd_ prefix', async () => {
    const service = new GtdAuthService(
      prisma,
      { getSessionFromRequest: jest.fn() } as unknown as AuthService,
      config as never,
    );

    await expect(service.findWorkspaceByMcpToken('not-a-gtd-key')).resolves.toBe(
      null,
    );
    expect(workspaceFind).not.toHaveBeenCalled();
  });
});
