import { Body, Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { GtdAuthService } from '../gtd/gtd-auth.service';
import { McpAuthContext, McpToolsService } from './mcp-tools.service';

/**
 * Stateless MCP endpoint (Streamable HTTP): every POST creates a fresh
 * server + transport pair, so no session state is kept between requests.
 *
 * Auth is per-request and optional:
 *  - no Authorization header  -> public tools only (map)
 *  - Authorization: Bearer <MCP_API_KEY> -> plus reels tools
 *  - plus X-Chat-Id: <telegram chat id>  -> plus diary tools for that chat
 *  - Authorization: Bearer <workspace mcpToken> -> GTD tools for that
 *    workspace (no X-Chat-Id). The token is shown in GTD settings / /gtdkey.
 */
@Controller('mcp')
export class McpController {
  constructor(
    private readonly configService: ConfigService,
    private readonly mcpToolsService: McpToolsService,
    private readonly gtdAuth: GtdAuthService,
  ) {}

  @Post()
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    const auth = await this.resolveAuth(req);
    if (!auth) {
      res.status(401).json(this.rpcError(-32001, 'Invalid API key'));
      return;
    }

    const baseUrl =
      process.env.VLANDIVIR_2025_BASE_URL ||
      `${req.protocol}://${req.get('host')}`;
    const server = this.mcpToolsService.createServer(auth, baseUrl);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json(this.rpcError(-32603, 'Internal server error'));
      }
    }
  }

  // Stateless mode: no SSE stream to resume and no session to delete
  @Get()
  handleGet(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  @Delete()
  handleDelete(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response) {
    res
      .status(405)
      .set('Allow', 'POST')
      .json(this.rpcError(-32000, 'Method not allowed'));
  }

  /**
   * Missing key -> anonymous access, wrong key -> null (rejected). The
   * X-Chat-Id header is only honoured together with MCP_API_KEY (diary).
   */
  private async resolveAuth(req: Request): Promise<McpAuthContext | null> {
    const header = req.headers.authorization;
    const token =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : undefined;
    if (!token) {
      return { authorized: false, gtdWorkspaceId: null, chatId: null };
    }

    const mcpKey = this.configService.get<string>('MCP_API_KEY');
    if (mcpKey && this.isSameSecret(token, mcpKey)) {
      const chatIdHeader = req.headers['x-chat-id'];
      const chatId =
        typeof chatIdHeader === 'string' && /^\d+$/.test(chatIdHeader.trim())
          ? BigInt(chatIdHeader.trim())
          : null;
      return { authorized: true, gtdWorkspaceId: null, chatId };
    }

    const workspace = await this.gtdAuth.findWorkspaceByMcpToken(token);
    if (workspace) {
      return {
        authorized: false,
        gtdWorkspaceId: workspace.id,
        chatId: null,
      };
    }
    return null;
  }

  private isSameSecret(receivedKey: string, expectedKey: string): boolean {
    const received = Buffer.from(receivedKey);
    const expected = Buffer.from(expectedKey);

    if (received.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(received, expected);
  }

  private rpcError(code: number, message: string) {
    return { jsonrpc: '2.0', error: { code, message }, id: null };
  }
}
