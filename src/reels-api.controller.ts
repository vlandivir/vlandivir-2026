import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EditAccessGuard } from './auth/edit-access.guard';
import { PrismaService } from './prisma/prisma.service';
import { ReelsService } from './services/reels.service';
import { ReelsQaService } from './services/reels-qa.service';

// Same limits as the map API — the tag dictionary is shared
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;

@Controller('reels-api')
export class ReelsApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reelsService: ReelsService,
    private readonly reelsQaService: ReelsQaService,
  ) {}

  @UseGuards(EditAccessGuard)
  @Get('reels')
  async listReels() {
    return this.prisma.reel.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // Semantic search over indexed reels: [{id, similarity}], best first.
  // The client merges these with its own substring filtering.
  @UseGuards(EditAccessGuard)
  @Get('search')
  async searchReels(@Query('q') q: string | undefined) {
    const query = (q || '').trim();
    if (!query) return [];
    return this.reelsService.searchReels(query);
  }

  // RAG Q&A over the notebook: answer + source reels ([#id] refs in text)
  @UseGuards(EditAccessGuard)
  @Get('ask')
  async askReels(@Query('q') q: string | undefined) {
    const question = (q || '').trim();
    if (!question) throw new BadRequestException('Нужен вопрос (?q=…)');
    const result = await this.reelsQaService.ask(question);
    return result ?? { answer: null, sources: [] };
  }

  @UseGuards(EditAccessGuard)
  @Get('reels/:id')
  async getReel(@Param('id', ParseIntPipe) id: number) {
    const reel = await this.prisma.reel.findUnique({ where: { id } });
    if (!reel) throw new NotFoundException('Reel not found');
    return reel;
  }

  @UseGuards(EditAccessGuard)
  @Post('reels')
  async createReel(@Body() body: { instagramUrl?: string }) {
    const instagramUrl = (body.instagramUrl || '').trim();
    const shortcode = this.reelsService.extractShortcode(instagramUrl);
    if (!shortcode) {
      throw new BadRequestException(
        'Нужна ссылка на Instagram reel (instagram.com/reel/…)',
      );
    }

    const existing = await this.prisma.reel.findUnique({
      where: { shortcode },
    });
    if (existing) {
      // A failed attempt can be retried by re-submitting the same link
      if (existing.status === 'error') {
        const restarted = await this.prisma.reel.update({
          where: { id: existing.id },
          data: { status: 'pending', error: null },
        });
        this.reelsService.processInBackground(existing.id);
        return restarted;
      }
      if (existing.isOwn && existing.status === 'ready') {
        await this.reelsService.ensureOwnReelInDiary(existing.id);
      }
      throw new BadRequestException('Этот ролик уже добавлен');
    }

    const reel = await this.prisma.reel.create({
      data: { instagramUrl, shortcode },
    });
    this.reelsService.processInBackground(reel.id);
    return reel;
  }

  @UseGuards(EditAccessGuard)
  @Post('reels/:id/retry')
  async retryReel(@Param('id', ParseIntPipe) id: number) {
    const reel = await this.prisma.reel.findUnique({ where: { id } });
    if (!reel) throw new NotFoundException('Reel not found');

    const restarted = await this.prisma.reel.update({
      where: { id },
      data: { status: 'pending', error: null },
    });
    this.reelsService.processInBackground(id);
    return restarted;
  }

  // Tags are set by hand; unknown names are added to the shared MapTag
  // dictionary (emoji can be picked later in the 🏷 editor on /places)
  @UseGuards(EditAccessGuard)
  @Post('reels/:id/tags')
  async updateReelTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tags?: unknown },
  ) {
    const reel = await this.prisma.reel.findUnique({ where: { id } });
    if (!reel) throw new NotFoundException('Reel not found');

    const tags = this.parseTags(body.tags);
    for (const name of tags) {
      await this.prisma.mapTag.upsert({
        where: { name },
        create: { name },
        update: {},
      });
    }
    const updated = await this.prisma.reel.update({
      where: { id },
      data: { tags },
    });
    // Tags are part of the search embedding text
    void this.reelsService.indexReel(id).catch(() => undefined);
    return updated;
  }

  private parseTags(tags: unknown): string[] {
    if (tags === undefined || tags === null) return [];
    if (!Array.isArray(tags)) {
      throw new BadRequestException('Tags must be an array of strings');
    }
    const parsed = [
      ...new Set(
        tags.map((tag) => {
          if (typeof tag !== 'string' || !tag.trim()) {
            throw new BadRequestException(
              'Each tag must be a non-empty string',
            );
          }
          if (tag.length > MAX_TAG_LENGTH) {
            throw new BadRequestException(
              `Tags must be at most ${MAX_TAG_LENGTH} characters`,
            );
          }
          return tag.trim().toLowerCase();
        }),
      ),
    ];
    if (parsed.length > MAX_TAGS) {
      throw new BadRequestException(`At most ${MAX_TAGS} tags are allowed`);
    }
    return parsed;
  }

  // Re-run transcription for every downloaded reel (sequential, background)
  @UseGuards(EditAccessGuard)
  @Post('transcribe-all')
  async transcribeAll() {
    const queued = await this.reelsService.transcribeAllInBackground();
    return { queued };
  }

  // Download + process pending reels slowly (throttled), one at a time.
  // Query: delayMs (default 180000 ≈ 3 min between reels), limit (optional).
  @UseGuards(EditAccessGuard)
  @Post('process-pending')
  async processPending(
    @Query('delayMs') delayMs?: string,
    @Query('limit') limit?: string,
  ) {
    const delay = delayMs ? Number(delayMs) : undefined;
    const take = limit ? Number(limit) : undefined;
    if (delay !== undefined && (!Number.isFinite(delay) || delay < 0)) {
      throw new BadRequestException('delayMs must be a non-negative number');
    }
    if (take !== undefined && (!Number.isInteger(take) || take < 1)) {
      throw new BadRequestException('limit must be a positive integer');
    }
    const queued = await this.reelsService.processPendingInBackground(
      delay,
      take,
    );
    return { queued };
  }

  // Force audio extraction + Whisper transcription for an already
  // downloaded reel
  @UseGuards(EditAccessGuard)
  @Post('reels/:id/transcribe')
  async transcribeReel(@Param('id', ParseIntPipe) id: number) {
    const reel = await this.prisma.reel.findUnique({ where: { id } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.status !== 'ready' || !reel.videoUrl) {
      throw new BadRequestException(
        'Сначала должно загрузиться видео — распознавать пока нечего',
      );
    }

    const updated = await this.prisma.reel.update({
      where: { id },
      data: { transcriptStatus: 'pending', transcriptError: null },
    });
    this.reelsService.transcribeInBackground(id);
    return updated;
  }

  // Regenerate titles for every analyzed reel (sequential, background)
  @UseGuards(EditAccessGuard)
  @Post('generate-titles')
  async generateTitles() {
    const reels = await this.prisma.reel.findMany({
      where: { status: 'ready' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    void (async () => {
      for (const { id } of reels) {
        await this.reelsService.generateTitle(id).catch(() => undefined);
      }
    })();
    return { queued: reels.length };
  }

  // (Re)compute search embeddings for every analyzed reel (background)
  @UseGuards(EditAccessGuard)
  @Post('embed-all')
  async embedAll() {
    const queued = await this.reelsService.embedAllInBackground();
    return { queued };
  }

  // Force frame extraction + LLM description for an already downloaded reel
  @UseGuards(EditAccessGuard)
  @Post('reels/:id/vision')
  async visionReel(@Param('id', ParseIntPipe) id: number) {
    const reel = await this.prisma.reel.findUnique({ where: { id } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.status !== 'ready' || !reel.videoUrl) {
      throw new BadRequestException(
        'Сначала должно загрузиться видео — разбирать пока нечего',
      );
    }

    const updated = await this.prisma.reel.update({
      where: { id },
      data: { visionStatus: 'pending', visionError: null },
    });
    this.reelsService.visionInBackground(id);
    return updated;
  }

  @UseGuards(EditAccessGuard)
  @Delete('reels/:id')
  async deleteReel(@Param('id', ParseIntPipe) id: number) {
    const reel = await this.prisma.reel.findUnique({ where: { id } });
    if (!reel) throw new NotFoundException('Reel not found');

    await this.prisma.reel.delete({ where: { id } });
    await this.reelsService.unindexReel(id);
    return { deleted: true };
  }

  @UseGuards(EditAccessGuard)
  @Post('key-check')
  checkKey() {
    return { ok: true };
  }
}
