import { BadRequestException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { GtdTaskStatus } from '../generated/prisma-client';
import type { GtdService } from '../gtd/gtd.service';
import type { PrismaService } from '../prisma/prisma.service';
import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService GTD tools', () => {
  const connect = async (gtd: Partial<GtdService>) => {
    const prisma = {
      gtdIdentity: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'identity-1', workspaceId: 'ws' }),
      },
    } as unknown as PrismaService;
    const service = new McpToolsService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      gtd as GtdService,
    );
    const server = service.createServer(
      { authorized: false, gtdWorkspaceId: 'ws', chatId: null },
      'https://example.test',
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return client;
  };

  it('exposes gtd_complete and mentions it in the instructions', async () => {
    const client = await connect({});

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain('gtd_complete');
    expect(client.getInstructions()).toContain('gtd_complete');
    await client.close();
  });

  it('completes the task through GtdService.act', async () => {
    const act = jest.fn().mockResolvedValue({
      id: 'task-1',
      content: 'Ship gtd_complete',
      status: GtdTaskStatus.COMPLETED,
      completedAt: '2026-10-28T10:00:00.000Z',
      orderKey: '42',
    });
    const client = await connect({ act } as Partial<GtdService>);

    const result = await client.callTool({
      name: 'gtd_complete',
      arguments: { taskId: 'task-1' },
    });

    expect(act).toHaveBeenCalledWith('ws', 'task-1', 'COMPLETE');
    expect(result.isError).toBeFalsy();
    const [content] = result.content as { type: 'text'; text: string }[];
    expect(JSON.parse(content.text)).toEqual({
      id: 'task-1',
      content: 'Ship gtd_complete',
      status: GtdTaskStatus.COMPLETED,
      completedAt: '2026-10-28T10:00:00.000Z',
    });
    await client.close();
  });

  it('returns a tool error for a task that is already closed', async () => {
    const act = jest
      .fn()
      .mockRejectedValue(new BadRequestException('Task is not active'));
    const client = await connect({ act } as Partial<GtdService>);

    const result = await client.callTool({
      name: 'gtd_complete',
      arguments: { taskId: 'task-1' },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: 'Task is not active' },
    ]);
    await client.close();
  });
});
