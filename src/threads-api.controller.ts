import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminSessionGuard } from './auth/admin-session.guard';
import {
  ThreadsDestination,
  ThreadsService,
  ThreadsStatus,
} from './services/threads.service';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from './services/threads-text';

type DraftBody = {
  text?: string;
  destination?: ThreadsDestination;
  ghost?: boolean;
  topic?: string | null;
  poll?: string[] | string | null;
};

type UploadedMemoryFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@UseGuards(AdminSessionGuard)
@Controller('threads-api')
export class ThreadsApiController {
  constructor(private readonly threads: ThreadsService) {}

  @Get('posts')
  list(@Query('status') status?: string) {
    const filtered =
      status === 'draft' || status === 'published'
        ? (status as ThreadsStatus)
        : undefined;
    return this.threads.listPosts(filtered);
  }

  @Get('posts/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.threads.getPost(id);
  }

  @Post('posts')
  create(@Body() body: DraftBody) {
    return this.threads.createDraft(body);
  }

  @Patch('posts/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: DraftBody) {
    return this.threads.updateDraft(id, body);
  }

  @Post('posts/:id/images')
  @UseInterceptors(
    FilesInterceptor('images', MAX_IMAGES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  addImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files?: UploadedMemoryFile[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('No images uploaded');
    }
    return this.threads.addImages(
      id,
      files.map((file) => ({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      })),
    );
  }

  @Delete('posts/:id/images/:imageId')
  removeImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.threads.removeImage(id, imageId);
  }

  @Post('posts/:id/publish')
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.threads.publish(id);
  }

  @Post('reconcile')
  reconcile() {
    return this.threads.reconcileOrphanDrafts();
  }

  @Post('posts/:id/insights')
  insights(@Param('id', ParseIntPipe) id: number) {
    return this.threads.refreshInsights(id);
  }
}
