import { Body, Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { McpAuthContext, McpToolsService } from './mcp-tools.service';

/**
 * Stateless MCP endpoint (Streamable HTTP): every POST creates a fresh
 * server + transport pair, so no session state is kept between requests.
 *
 * Auth is per-request and optional:
 *  - no Authorization header  -> public tools only (map)
 *  - Authorization: Bearer <MCP_API_KEY> -> plus reels tools
 *  - plus X-Chat-Id: <telegram chat id>  -> plus diary tools for that chat
 */
@Controller('mcp')
export class McpController {
  constructor(
    private readonly configService: ConfigService,
    private readonly mcpToolsService: McpToolsService,
  ) {}

  @Post()
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    const auth = this.resolveAuth(req);
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
   * X-Chat-Id header is only honoured together with a valid key.
   */
  private resolveAuth(req: Request): McpAuthContext | null {
    const header = req.headers.authorization;
    const token =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : undefined;
    if (!token) {
      return { authorized: false, chatId: null };
    }

    const expectedKey = this.configService.get<string>('MCP_API_KEY');
    if (!expectedKey || !this.isSameSecret(token, expectedKey)) {
      return null;
    }

    const chatIdHeader = req.headers['x-chat-id'];
    const chatId =
      typeof chatIdHeader === 'string' && /^\d+$/.test(chatIdHeader.trim())
        ? BigInt(chatIdHeader.trim())
        : null;
    return { authorized: true, chatId };
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
