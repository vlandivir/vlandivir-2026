import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma-client';
import { v4 as uuidv4 } from 'uuid';
import { getDiaryChatIdNumber } from '../diary.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { StorageService } from './storage.service';
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  POLL_KEYS,
  ThreadsTextError,
  extForMime,
  normalizeTopicTag,
  parsePollOptions,
  pollAttachmentJson,
  pollDiaryLine,
  splitIntoPosts,
} from './threads-text';

const THREADS_GRAPH = 'https://graph.threads.net/v1.0';
const POLL_MEDIA_FIELDS =
  'id,permalink,' +
  'poll_attachment{' +
  'option_a,option_b,option_c,option_d,' +
  'option_a_votes_percentage,option_b_votes_percentage,' +
  'option_c_votes_percentage,option_d_votes_percentage,' +
  'total_votes,expiration_timestamp}';
const CONVERSATION_FIELDS = [
  'id',
  'text',
  'username',
  'permalink',
  'timestamp',
  'media_type',
  'media_url',
  'shortcode',
  'thumbnail_url',
  'has_replies',
  'root_post',
  'replied_to',
  'is_reply',
  'is_reply_owned_by_me',
  'hide_status',
  'is_verified',
  'gif_url',
].join(',');
const ROOT_FIELDS = [
  'id',
  'text',
  'username',
  'permalink',
  'timestamp',
  'shortcode',
  'has_replies',
  'reply_audience',
  'media_type',
  'media_url',
].join(',');

export type ThreadsDestination = 'threads' | 'diary';
export type ThreadsStatus = 'draft' | 'published';

export type ThreadsDraftInput = {
  text?: string;
  destination?: ThreadsDestination;
  ghost?: boolean;
  topic?: string | null;
  poll?: string[] | string | null;
};

export type ThreadsUploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type ThreadsStats = {
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  shares?: number;
  updated?: string;
};

export type ThreadsPollResults = {
  options: { text: string; percent?: number }[];
  totalVotes?: number;
  expires?: string;
};

const postInclude = { images: { orderBy: { sortOrder: 'asc' as const } } };

type PostWithImages = Prisma.ThreadsPostGetPayload<{
  include: typeof postInclude;
}>;

@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly telegram: TelegramBotService,
  ) {}

  async listPosts(status?: ThreadsStatus) {
    const posts = await this.prisma.threadsPost.findMany({
      where: status ? { status } : undefined,
      include: postInclude,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    return posts.map((post) => this.serialize(post));
  }

  async getPost(id: number) {
    return this.serialize(await this.requirePost(id));
  }

  async createDraft(input: ThreadsDraftInput) {
    const data = this.normalizeDraft(input);
    const post = await this.prisma.threadsPost.create({
      data,
      include: postInclude,
    });
    return this.serialize(post);
  }

  async updateDraft(id: number, input: ThreadsDraftInput) {
    const existing = await this.requirePost(id);
    if (existing.status === 'published') {
      throw new BadRequestException('Published posts cannot be edited');
    }
    const data = this.normalizeDraft(input, existing);
    const post = await this.prisma.threadsPost.update({
      where: { id },
      data,
      include: postInclude,
    });
    return this.serialize(post);
  }

  async addImages(id: number, files: ThreadsUploadedFile[]) {
    const post = await this.requirePost(id);
    if (post.status === 'published') {
      throw new BadRequestException('Published posts cannot be edited');
    }
    if (post.poll.length) {
      throw new BadRequestException('poll is text-only; omit images');
    }
    if (!files.length) {
      throw new BadRequestException('No images uploaded');
    }
    if (post.images.length + files.length > MAX_IMAGES) {
      throw new BadRequestException(`Too many images, max ${MAX_IMAGES}`);
    }
    let sortOrder = post.images.length;
    for (const file of files) {
      this.assertImage(file);
      const { url, key } = await this.uploadImage(file);
      await this.prisma.threadsImage.create({
        data: {
          postId: id,
          url,
          key,
          sortOrder,
        },
      });
      sortOrder += 1;
    }
    return this.serialize(await this.requirePost(id));
  }

  async removeImage(id: number, imageId: number) {
    const post = await this.requirePost(id);
    if (post.status === 'published') {
      throw new BadRequestException('Published posts cannot be edited');
    }
    const image = post.images.find((item) => item.id === imageId);
    if (!image) throw new NotFoundException('Image not found');
    await this.prisma.threadsImage.delete({ where: { id: imageId } });
    const remaining = await this.prisma.threadsImage.findMany({
      where: { postId: id },
      orderBy: { sortOrder: 'asc' },
    });
    await Promise.all(
      remaining.map((item, index) =>
        this.prisma.threadsImage.update({
          where: { id: item.id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.serialize(await this.requirePost(id));
  }

  async publish(id: number) {
    const post = await this.requirePost(id);
    if (post.status === 'published') {
      throw new BadRequestException('Post is already published');
    }
    const text = post.text.trim();
    const imageUrls = post.images.map((image) => image.url);
    if (!text && !imageUrls.length) {
      throw new BadRequestException('Text and images are empty');
    }
    if (post.poll.length && imageUrls.length) {
      throw new BadRequestException('poll is text-only; omit images');
    }

    let permalink: string | null = null;
    let mediaId: string | null = null;
    let parts = 0;

    if (post.destination === 'threads') {
      const posted = await this.publishToThreads({
        text,
        ghost: post.ghost,
        imageUrls,
        topicTag: post.topic || '',
        pollOptions: post.poll,
      });
      permalink = posted.permalink;
      mediaId = posted.id;
      parts = posted.parts;
    }

    const diary = await this.copyToDiary(post, permalink);

    const updated = await this.prisma.threadsPost.update({
      where: { id },
      data: {
        status: 'published',
        url: permalink,
        mediaId,
        diaryNoteId: diary.id,
        publishedAt: new Date(),
      },
      include: postInclude,
    });
    return {
      ...this.serialize(updated),
      parts,
      diaryNoteId: diary.id,
    };
  }

  async refreshInsights(id: number) {
    const post = await this.requirePost(id);
    if (!post.mediaId && !post.url) {
      throw new BadRequestException('Post has no Threads media id');
    }
    const token = this.requireToken();
    const mediaId =
      post.mediaId || (await this.lookupMediaId(token, post.url || ''));
    if (!mediaId) {
      throw new NotFoundException('Threads media not found for permalink');
    }
    const insights = await this.fetchInsights(token, mediaId);
    const poll = insights.poll;
    delete insights.poll;
    const prev = (post.stats as ThreadsStats | null) || null;
    const prevReplies = prev?.replies;
    const nextStats: ThreadsStats = {
      views: insights.views,
      likes: insights.likes,
      replies: insights.replies,
      reposts: insights.reposts,
      quotes: insights.quotes,
      shares: insights.shares,
      updated: new Date().toISOString(),
    };
    const repliesChanged =
      typeof nextStats.replies === 'number' &&
      nextStats.replies !== prevReplies &&
      (nextStats.replies > 0 ||
        (typeof prevReplies === 'number' && prevReplies > 0));
    const shouldFetchReplies =
      repliesChanged ||
      (typeof nextStats.replies === 'number' &&
        nextStats.replies > 0 &&
        !post.repliesJson);

    let repliesJson: Prisma.InputJsonValue | typeof post.repliesJson =
      post.repliesJson;
    if (shouldFetchReplies) {
      repliesJson = (await this.dumpConversation(
        token,
        mediaId,
      )) as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.threadsPost.update({
      where: { id },
      data: {
        mediaId,
        url: insights.permalink || post.url,
        statsPrev: prev ? (prev as Prisma.InputJsonValue) : Prisma.JsonNull,
        stats: nextStats as Prisma.InputJsonValue,
        pollResults: poll
          ? (poll as Prisma.InputJsonValue)
          : post.pollResults === null
            ? undefined
            : post.pollResults,
        repliesJson:
          repliesJson == null
            ? undefined
            : (repliesJson as Prisma.InputJsonValue),
      },
      include: postInclude,
    });
    return {
      ...this.serialize(updated),
      conversationUpdated: shouldFetchReplies,
    };
  }

  serialize(post: PostWithImages) {
    return {
      id: post.id,
      canvasId: post.canvasId,
      text: post.text,
      status: post.status,
      destination: post.destination,
      ghost: post.ghost,
      topic: post.topic,
      poll: post.poll,
      url: post.url,
      mediaId: post.mediaId,
      diaryNoteId: post.diaryNoteId,
      stats: post.stats,
      statsPrev: post.statsPrev,
      pollResults: post.pollResults,
      replies: post.repliesJson,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      images: post.images.map((image) => ({
        id: image.id,
        url: image.url,
        key: image.key,
        sortOrder: image.sortOrder,
      })),
    };
  }

  private async requirePost(id: number): Promise<PostWithImages> {
    const post = await this.prisma.threadsPost.findUnique({
      where: { id },
      include: postInclude,
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private normalizeDraft(
    input: ThreadsDraftInput,
    existing?: PostWithImages,
  ): Prisma.ThreadsPostUpdateInput & Prisma.ThreadsPostCreateInput {
    let topic: string | null | undefined;
    if (input.topic !== undefined) {
      try {
        topic = normalizeTopicTag(input.topic || '') || null;
      } catch (error) {
        this.rethrowText(error);
      }
    }
    let poll: string[] | undefined;
    if (input.poll !== undefined) {
      try {
        poll = input.poll ? parsePollOptions(input.poll) : [];
      } catch (error) {
        this.rethrowText(error);
      }
    }
    const destination = input.destination ?? existing?.destination ?? 'threads';
    if (destination !== 'threads' && destination !== 'diary') {
      throw new BadRequestException('destination must be threads or diary');
    }
    const nextPoll = poll ?? existing?.poll ?? [];
    const nextImages = existing?.images.length ?? 0;
    if (nextPoll.length && nextImages) {
      throw new BadRequestException('poll is text-only; omit images');
    }
    return {
      text: input.text !== undefined ? input.text : (existing?.text ?? ''),
      destination,
      ghost: input.ghost ?? existing?.ghost ?? false,
      topic: topic === undefined ? existing?.topic : topic,
      poll: poll === undefined ? existing?.poll : poll,
    };
  }

  private rethrowText(error: unknown): never {
    if (error instanceof ThreadsTextError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }

  private assertImage(file: ThreadsUploadedFile) {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG and PNG images are supported');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image is larger than 8 MB');
    }
  }

  private async uploadImage(
    file: ThreadsUploadedFile,
  ): Promise<{ url: string; key: string }> {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const key = `threads/${now.getUTCFullYear()}/${month}/${uuidv4()}${extForMime(file.mimetype)}`;
    const url = await this.storage.uploadFileWithKey(
      file.buffer,
      file.mimetype,
      key,
    );
    return { url, key };
  }

  private requireToken(): string {
    const token =
      this.config.get<string>('THREADS_ACCESS_TOKEN')?.trim() || '';
    if (!token) {
      throw new InternalServerErrorException(
        'THREADS_ACCESS_TOKEN is not configured',
      );
    }
    return token;
  }

  private async publishToThreads(input: {
    text: string;
    ghost: boolean;
    imageUrls: string[];
    topicTag: string;
    pollOptions: string[];
  }) {
    const token = this.requireToken();
    const parts = splitIntoPosts(input.text);
    if (!parts.length && !input.imageUrls.length) {
      throw new BadRequestException('Text and images are empty');
    }
    const firstText = parts[0] ?? '';
    const rest = parts.slice(1);
    const first = await this.createAndPublish(token, firstText, {
      ghost: input.ghost,
      imageUrls: input.imageUrls,
      topicTag: input.topicTag,
      pollOptions: input.pollOptions,
    });
    const posts = [first];
    for (const part of rest) {
      await this.sleep(1000);
      posts.push(
        await this.createAndPublish(token, part, { replyToId: first.id }),
      );
    }
    return {
      id: posts[0].id,
      permalink: posts[0].permalink,
      timestamp: posts[0].timestamp,
      parts: posts.length,
      posts,
    };
  }

  private async createAndPublish(
    token: string,
    text: string,
    options: {
      ghost?: boolean;
      replyToId?: string;
      imageUrls?: string[];
      topicTag?: string;
      pollOptions?: string[];
    } = {},
  ) {
    const urls = options.imageUrls || [];
    const pollOptions = options.pollOptions || [];
    const extra: Record<string, string> = {};
    if (options.ghost) extra.is_ghost_post = 'true';
    if (options.replyToId) extra.reply_to_id = options.replyToId;
    if (options.topicTag && !options.replyToId) {
      extra.topic_tag = options.topicTag;
    }
    if (pollOptions.length) {
      if (urls.length) {
        throw new BadRequestException('poll is text-only; omit images');
      }
      if (options.replyToId) {
        throw new BadRequestException(
          'poll can only be attached to the first post',
        );
      }
      extra.poll_attachment = pollAttachmentJson(pollOptions);
    }

    let containerId: string;
    let wait = false;
    if (urls.length === 0) {
      if (!text) throw new BadRequestException('Text is empty');
      containerId = await this.createContainer(token, {
        media_type: 'TEXT',
        text,
        ...extra,
      });
    } else if (urls.length === 1) {
      const data: Record<string, string> = {
        media_type: 'IMAGE',
        image_url: urls[0],
        ...extra,
      };
      if (text) data.text = text;
      containerId = await this.createContainer(token, data);
      wait = true;
    } else if (urls.length <= MAX_IMAGES) {
      const children: string[] = [];
      for (const url of urls) {
        const childId = await this.createContainer(token, {
          media_type: 'IMAGE',
          image_url: url,
          is_carousel_item: 'true',
        });
        await this.waitForContainer(token, childId);
        children.push(childId);
      }
      const data: Record<string, string> = {
        media_type: 'CAROUSEL',
        children: children.join(','),
        ...extra,
      };
      if (text) data.text = text;
      containerId = await this.createContainer(token, data);
      wait = true;
    } else {
      throw new BadRequestException(
        `Too many images (${urls.length}), max ${MAX_IMAGES}`,
      );
    }

    return this.publishContainer(token, containerId, wait);
  }

  private async createContainer(
    token: string,
    data: Record<string, string>,
  ): Promise<string> {
    const created = await this.graphPost('/me/threads', {
      access_token: token,
      ...data,
    });
    const id = created.id;
    if (!id) {
      throw new InternalServerErrorException(
        `Threads create failed: ${this.errorMessage(created)}`,
      );
    }
    return String(id);
  }

  private async publishContainer(
    token: string,
    containerId: string,
    wait: boolean,
  ) {
    if (wait) await this.waitForContainer(token, containerId);
    const published = await this.graphPost(
      '/me/threads_publish',
      { creation_id: containerId, access_token: token },
      60_000,
    );
    const mediaId = published.id;
    if (!mediaId) {
      throw new InternalServerErrorException(
        `Threads publish failed: ${this.errorMessage(published)}`,
      );
    }
    const media = await this.graphGet(`/${mediaId}`, {
      fields: 'id,text,permalink,timestamp',
      access_token: token,
    });
    return {
      id: String(mediaId),
      permalink: typeof media.permalink === 'string' ? media.permalink : null,
      timestamp: typeof media.timestamp === 'string' ? media.timestamp : null,
    };
  }

  private async waitForContainer(
    token: string,
    containerId: string,
    timeoutMs = 60_000,
  ) {
    const deadline = Date.now() + timeoutMs;
    let lastStatus = '';
    while (Date.now() < deadline) {
      const payload = await this.graphGet(`/${containerId}`, {
        fields: 'status,error_message',
        access_token: token,
      });
      lastStatus = String(payload.status || '');
      if (lastStatus === 'FINISHED') return;
      if (lastStatus === 'ERROR' || lastStatus === 'EXPIRED') {
        throw new InternalServerErrorException(
          `Threads container ${containerId} ${lastStatus}: ${payload.error_message || lastStatus}`,
        );
      }
      await this.sleep(3000);
    }
    if (lastStatus === '' || lastStatus === 'IN_PROGRESS') return;
    throw new InternalServerErrorException(
      `Threads container ${containerId} not ready after ${timeoutMs / 1000}s (${lastStatus || 'unknown'})`,
    );
  }

  private async fetchInsights(token: string, mediaId: string) {
    const payload = await this.graphGet(`/${mediaId}/insights`, {
      metric: 'views,likes,replies,reposts,quotes,shares',
      access_token: token,
    });
    const result: Record<string, unknown> = { mediaId };
    for (const item of payload.data || []) {
      if (!item || typeof item !== 'object') continue;
      const name = (item as { name?: string }).name;
      if (!name) continue;
      result[name] = this.insightValue(item as Record<string, unknown>);
    }
    const permalink = await this.graphGet(`/${mediaId}`, {
      fields: 'permalink',
      access_token: token,
    });
    if (typeof permalink.permalink === 'string') {
      result.permalink = permalink.permalink;
    }
    const poll = await this.fetchPollResults(token, mediaId);
    if (poll) result.poll = poll;
    return result as {
      mediaId: string;
      permalink?: string;
      views?: number;
      likes?: number;
      replies?: number;
      reposts?: number;
      quotes?: number;
      shares?: number;
      poll?: ThreadsPollResults;
    };
  }

  private insightValue(item: Record<string, unknown>): number {
    const values = item.values;
    if (Array.isArray(values) && values[0] && typeof values[0] === 'object') {
      const raw = (values[0] as { value?: unknown }).value;
      if (typeof raw === 'number') return raw;
    }
    const total = item.total_value;
    if (total && typeof total === 'object') {
      const raw = (total as { value?: unknown }).value;
      if (typeof raw === 'number') return raw;
    }
    if (typeof total === 'number') return total;
    return 0;
  }

  private async fetchPollResults(
    token: string,
    mediaId: string,
  ): Promise<ThreadsPollResults | null> {
    try {
      const payload = await this.graphGet(`/${mediaId}`, {
        fields: POLL_MEDIA_FIELDS,
        access_token: token,
      });
      const raw = payload.poll_attachment;
      if (!raw || typeof raw !== 'object') return null;
      const poll = raw as Record<string, unknown>;
      const options: { text: string; percent?: number }[] = [];
      for (const key of POLL_KEYS) {
        const text = poll[key];
        if (!text) continue;
        const item: { text: string; percent?: number } = {
          text: String(text),
        };
        const percent = poll[`${key}_votes_percentage`];
        if (typeof percent === 'number') item.percent = percent;
        options.push(item);
      }
      if (!options.length) return null;
      const result: ThreadsPollResults = { options };
      if (typeof poll.total_votes === 'number') {
        result.totalVotes = poll.total_votes;
      }
      if (poll.expiration_timestamp) {
        result.expires = String(poll.expiration_timestamp);
      }
      return result;
    } catch {
      return null;
    }
  }

  private async lookupMediaId(
    token: string,
    permalink: string,
  ): Promise<string | null> {
    const want = this.permalinkKey(permalink);
    if (!want) return null;
    let after = '';
    for (let i = 0; i < 8; i += 1) {
      const params: Record<string, string> = {
        fields: 'id,permalink,shortcode',
        limit: '25',
        access_token: token,
      };
      if (after) params.after = after;
      const payload = await this.graphGet('/me/threads', params);
      for (const item of payload.data || []) {
        if (!item || typeof item !== 'object') continue;
        const row = item as { id?: string; permalink?: string; shortcode?: string };
        if (this.permalinkKey(row.permalink || '') === want) {
          return row.id || null;
        }
        if ((row.shortcode || '') === want) return row.id || null;
      }
      after =
        (payload.paging as { cursors?: { after?: string } } | undefined)?.cursors
          ?.after || '';
      if (!after) break;
    }
    return null;
  }

  private async dumpConversation(token: string, mediaId: string) {
    const root = await this.graphGet(`/${mediaId}`, {
      fields: ROOT_FIELDS,
      access_token: token,
    });
    const replies: Record<string, unknown>[] = [];
    let after = '';
    for (let i = 0; i < 50; i += 1) {
      const params: Record<string, string> = {
        fields: CONVERSATION_FIELDS,
        reverse: 'false',
        limit: '100',
        access_token: token,
      };
      if (after) params.after = after;
      const payload = await this.graphGet(`/${mediaId}/conversation`, params);
      for (const item of payload.data || []) {
        if (item && typeof item === 'object') {
          replies.push(item as Record<string, unknown>);
        }
      }
      after =
        (payload.paging as { cursors?: { after?: string } } | undefined)?.cursors
          ?.after || '';
      if (!after) break;
    }
    const counts: Record<string, number> = { total: replies.length };
    for (const item of replies) {
      const status = String(item.hide_status || 'NOT_HUSHED');
      counts[status] = (counts[status] || 0) + 1;
    }
    counts.hiddenish = ['HIDDEN', 'COVERED', 'BLOCKED', 'RESTRICTED'].reduce(
      (sum, key) => sum + (counts[key] || 0),
      0,
    );
    return {
      fetched: new Date().toISOString(),
      root,
      replies,
      counts,
    };
  }

  private async copyToDiary(
    post: PostWithImages,
    permalink: string | null,
  ): Promise<{ id: number }> {
    const chunks = [post.text.trim()].filter(Boolean);
    if (permalink) chunks.push(permalink);
    if (post.poll.length) chunks.push(pollDiaryLine(post.poll));
    const extraUrls = post.images.slice(1).map((image) => image.url);
    if (extraUrls.length) chunks.push(extraUrls.join('\n'));
    const text = chunks.join('\n\n');
    const noteDate = new Date();
    const firstImage = post.images[0];
    const note = await this.prisma.note.create({
      data: {
        content: text,
        noteDate,
        chatId: getDiaryChatIdNumber(),
        rawMessage: {
          source: 'threads',
          text,
          permalink,
          poll: post.poll,
          threadsPostId: post.id,
        } satisfies Prisma.InputJsonValue,
        images: firstImage
          ? {
              create: {
                url: firstImage.url,
                description: null,
              },
            }
          : undefined,
      },
    });
    try {
      await this.telegram.sendApiNoteText(
        getDiaryChatIdNumber(),
        text,
        noteDate,
      );
    } catch (error) {
      this.logger.error(
        'Telegram notification failed after Threads diary copy',
        error instanceof Error ? error.stack : error,
      );
    }
    return { id: note.id };
  }

  private permalinkKey(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return trimmed.split('/').pop() || '';
  }

  private async graphGet(
    path: string,
    params: Record<string, string>,
    timeoutMs = 30_000,
  ): Promise<GraphPayload> {
    const query = new URLSearchParams(params).toString();
    return this.graphRequest('GET', `${THREADS_GRAPH}${path}?${query}`, timeoutMs);
  }

  private async graphPost(
    path: string,
    data: Record<string, string>,
    timeoutMs = 30_000,
  ): Promise<GraphPayload> {
    return this.graphRequest(
      'POST',
      `${THREADS_GRAPH}${path}`,
      timeoutMs,
      new URLSearchParams(data).toString(),
    );
  }

  private async graphRequest(
    method: string,
    url: string,
    timeoutMs: number,
    body?: string,
  ): Promise<GraphPayload> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: body
          ? {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'vlandivir-threads/1.0',
            }
          : { 'User-Agent': 'vlandivir-threads/1.0' },
        body,
        signal: controller.signal,
      });
      const raw = await response.text();
      let parsed: GraphPayload = {};
      try {
        parsed = raw ? (JSON.parse(raw) as GraphPayload) : {};
      } catch {
        parsed = { error: { message: raw || response.statusText } };
      }
      if (!response.ok) {
        throw new InternalServerErrorException(
          `Threads ${method} ${url} failed (${response.status}): ${this.errorMessage(parsed)}`,
        );
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  private errorMessage(payload: GraphPayload): string {
    const err = payload.error;
    if (err && typeof err === 'object' && 'message' in err && err.message) {
      return String(err.message);
    }
    return JSON.stringify(payload).slice(0, 400);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

type GraphPayload = {
  id?: string;
  status?: string;
  error_message?: string;
  permalink?: string;
  timestamp?: string;
  data?: unknown[];
  paging?: { cursors?: { after?: string } };
  poll_attachment?: unknown;
  error?: { message?: string };
  [key: string]: unknown;
};
