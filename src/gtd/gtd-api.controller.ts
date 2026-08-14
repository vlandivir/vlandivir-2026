import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { GtdAuthGuard } from './gtd-auth.guard';
import type { GtdRequest } from './gtd-auth.service';
import { GTD_MAX_FILE_BYTES, GtdService } from './gtd.service';

type UploadedAttachment = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@UseGuards(GtdAuthGuard)
@Controller('gtd-api')
export class GtdApiController {
  constructor(
    private readonly gtd: GtdService,
    private readonly authService: AuthService,
  ) {}
  @Get('bootstrap')
  bootstrap(
    @Req() req: GtdRequest,
    @Query('scope') scopeValue?: string,
    @Query('projectId') projectId?: string,
  ) {
    const kind =
      scopeValue === 'inbox' ||
      scopeValue === 'project' ||
      scopeValue === 'today'
        ? scopeValue
        : 'all';
    if (kind === 'project' && !projectId)
      throw new BadRequestException('projectId is required');
    return this.gtd.bootstrap(req.gtdAuth, { kind, projectId });
  }
  @Post('projects') createProject(
    @Req() req: GtdRequest,
    @Body() body: { name?: unknown },
  ) {
    return this.gtd.createProject(req.gtdAuth.workspaceId, body?.name);
  }
  @Patch('projects/:id') updateProject(
    @Req() req: GtdRequest,
    @Param('id') id: string,
    @Body() body: { name?: unknown; archived?: unknown },
  ) {
    return this.gtd.updateProject(req.gtdAuth.workspaceId, id, body || {});
  }
  @Post('tasks') createTask(
    @Req() req: GtdRequest,
    @Body() body: { content?: unknown; projectId?: unknown; dueDate?: unknown },
  ) {
    return this.gtd.createTask(
      req.gtdAuth.workspaceId,
      body?.content,
      body?.projectId,
      body?.dueDate,
    );
  }
  @Get('tasks') listTasks(
    @Req() req: GtdRequest,
    @Query('status') status?: string,
    @Query('updatedSince') updatedSince?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (
      limitRaw !== undefined &&
      (!Number.isInteger(limit) || (limit as number) < 1)
    ) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return this.gtd.listTasks(req.gtdAuth.workspaceId, {
      status,
      updatedSince,
      cursor,
      limit,
    });
  }
  @Get('projects') listProjects(
    @Req() req: GtdRequest,
    @Query('updatedSince') updatedSince?: string,
  ) {
    return this.gtd.listProjects(req.gtdAuth.workspaceId, updatedSince);
  }
  @Patch('tasks/:id') updateTask(
    @Req() req: GtdRequest,
    @Param('id') id: string,
    @Body()
    body: { content?: unknown; projectId?: unknown; dueDate?: unknown },
  ) {
    return this.gtd.updateTask(req.gtdAuth.workspaceId, id, body || {});
  }
  @Post('tasks/:id/actions') action(
    @Req() req: GtdRequest,
    @Param('id') id: string,
    @Body() body: { action?: unknown },
  ) {
    return this.gtd.act(req.gtdAuth.workspaceId, id, body?.action);
  }
  @Get('tasks/:id') task(@Req() req: GtdRequest, @Param('id') id: string) {
    return this.gtd.taskDetails(req.gtdAuth.workspaceId, id);
  }
  @Get('archive') archive(
    @Req() req: GtdRequest,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
  ) {
    return this.gtd.archive(req.gtdAuth.workspaceId, cursor, status);
  }

  @Post('tasks/:id/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: GTD_MAX_FILE_BYTES } }),
  )
  addAttachment(
    @Req() req: GtdRequest,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedAttachment,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.gtd.addAttachment(req.gtdAuth.workspaceId, id, file);
  }

  @Get('attachments/:id')
  @Header('Cache-Control', 'private, max-age=300')
  async attachment(
    @Req() req: GtdRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const result = await this.gtd.downloadAttachment(
      req.gtdAuth.workspaceId,
      id,
    );
    const ascii = result.attachment.originalName.replace(
      /[^\x20-\x7e]|["\\]/g,
      '_',
    );
    res.setHeader('Content-Type', result.attachment.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const mime = result.attachment.mimeType;
    const disposition =
      mime.startsWith('image/') || mime.startsWith('video/')
        ? 'inline'
        : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(result.attachment.originalName)}`,
    );
    res.send(result.buffer);
  }

  @Post('link/start') startLink(@Req() req: GtdRequest) {
    return this.gtd.startLink(req.gtdAuth, this.authService.baseUrl);
  }
  @Get('link/preview') linkPreview(
    @Req() req: GtdRequest,
    @Query('token') token?: string,
  ) {
    return this.gtd.linkPreview(req.gtdAuth, token || '');
  }
  @Post('link/confirm') confirmLink(
    @Req() req: GtdRequest,
    @Body() body: { token?: unknown },
  ) {
    if (typeof body?.token !== 'string')
      throw new BadRequestException('token is required');
    return this.gtd.confirmLink(req.gtdAuth, body.token);
  }
}
