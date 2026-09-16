import { BadRequestException } from '@nestjs/common';
import { ThreadsService, freshReplyIds } from './threads.service';

type MediaItem = {
  id: number;
  postId: number;
  kind: string;
  mimeType: string;
  size: bigint | null;
  originalFilename: string | null;
  url: string;
  key: string;
  sortOrder: number;
  uploadStatus: string;
  createdAt: Date;
};

type ThreadsInternals = {
  createAndPublish(
    token: string,
    text: string,
    options: {
      media?: { kind: 'image' | 'video'; url: string }[];
    },
  ): Promise<unknown>;
  createContainer(token: string, data: Record<string, string>): Promise<string>;
  waitForContainer(token: string, id: string, timeout?: number): Promise<void>;
  publishContainer(
    token: string,
    id: string,
    wait: boolean,
    timeout?: number,
  ): Promise<unknown>;
  copyToDiary(post: unknown, permalink: string | null): Promise<{ id: number }>;
};

function post(media: MediaItem[] = []) {
  const now = new Date('2026-09-14T04:00:00.000Z');
  return {
    id: 1,
    canvasId: null,
    text: 'Hello',
    status: 'draft',
    destination: 'threads',
    ghost: false,
    topic: null,
    poll: [],
    url: null,
    mediaId: null,
    diaryNoteId: null,
    stats: null,
    statsPrev: null,
    pollResults: null,
    repliesJson: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    media,
  };
}

function media(
  id: number,
  kind: 'image' | 'video',
  sortOrder: number,
  uploadStatus = 'ready',
): MediaItem {
  const ext = kind === 'video' ? 'mp4' : 'jpg';
  return {
    id,
    postId: 1,
    kind,
    mimeType: kind === 'video' ? 'video/mp4' : 'image/jpeg',
    size: 100n,
    originalFilename: `${kind}.${ext}`,
    url: `https://example.com/${id}.${ext}`,
    key: `threads/${id}.${ext}`,
    sortOrder,
    uploadStatus,
    createdAt: new Date(),
  };
}

describe('ThreadsService media', () => {
  let prisma: {
    threadsPost: { findUnique: jest.Mock; update: jest.Mock };
    threadsMedia: {
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
    note: { create: jest.Mock };
  };
  let storage: {
    getThreadsMediaPresignedPutUrl: jest.Mock;
    headByKey: jest.Mock;
    deleteByPublicUrl: jest.Mock;
  };
  let telegram: { sendApiNoteText: jest.Mock };
  let service: ThreadsService;
  let internals: ThreadsInternals;

  beforeEach(() => {
    prisma = {
      threadsPost: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      threadsMedia: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      note: { create: jest.fn() },
    };
    storage = {
      getThreadsMediaPresignedPutUrl: jest.fn(),
      headByKey: jest.fn(),
      deleteByPublicUrl: jest.fn(),
    };
    telegram = { sendApiNoteText: jest.fn().mockResolvedValue(undefined) };
    service = new ThreadsService(
      prisma as never,
      storage as never,
      { get: jest.fn().mockReturnValue('token') } as never,
      telegram as never,
    );
    internals = service as unknown as ThreadsInternals;
  });

  it('rejects videos larger than 1 GB before creating upload URLs', async () => {
    prisma.threadsPost.findUnique.mockResolvedValue(post());

    await expect(
      service.prepareMediaUploads(1, [
        {
          name: 'large.mp4',
          mimeType: 'video/mp4',
          size: 1024 * 1024 * 1024 + 1,
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.getThreadsMediaPresignedPutUrl).not.toHaveBeenCalled();
  });

  it('blocks publishing while an upload is unfinished', async () => {
    prisma.threadsPost.findUnique.mockResolvedValue(
      post([media(1, 'video', 0, 'uploading')]),
    );

    await expect(service.publish(1)).rejects.toThrow(
      'Wait for all media uploads to finish',
    );
  });

  it('marks an uploaded file ready after checking Spaces metadata', async () => {
    const uploading = post([media(1, 'video', 0, 'uploading')]);
    const ready = post([media(1, 'video', 0)]);
    prisma.threadsPost.findUnique
      .mockResolvedValueOnce(uploading)
      .mockResolvedValueOnce(ready);
    storage.headByKey.mockResolvedValue({
      size: 100,
      contentType: 'video/mp4',
    });

    await expect(service.completeMediaUpload(1, 1)).resolves.toEqual(
      expect.objectContaining({
        media: [expect.objectContaining({ uploadStatus: 'ready' })],
      }),
    );
    expect(prisma.threadsMedia.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { uploadStatus: 'ready' },
    });
  });

  it('publishes a single video as VIDEO and waits up to five minutes', async () => {
    jest.spyOn(internals, 'createContainer').mockResolvedValue('container-1');
    jest.spyOn(internals, 'publishContainer').mockResolvedValue({
      id: 'live-1',
      permalink: 'https://threads.net/t/live-1',
    });

    await internals.createAndPublish('token', 'Caption', {
      media: [{ kind: 'video', url: 'https://example.com/video.mp4' }],
    });

    expect(internals.createContainer).toHaveBeenCalledWith('token', {
      media_type: 'VIDEO',
      video_url: 'https://example.com/video.mp4',
      text: 'Caption',
    });
    expect(internals.publishContainer).toHaveBeenCalledWith(
      'token',
      'container-1',
      true,
      300_000,
    );
  });

  it('keeps image/video order in a mixed carousel', async () => {
    jest
      .spyOn(internals, 'createContainer')
      .mockResolvedValueOnce('image-child')
      .mockResolvedValueOnce('video-child')
      .mockResolvedValueOnce('carousel');
    jest.spyOn(internals, 'waitForContainer').mockResolvedValue(undefined);
    jest.spyOn(internals, 'publishContainer').mockResolvedValue({
      id: 'live-1',
      permalink: null,
    });

    await internals.createAndPublish('token', 'Mixed', {
      media: [
        { kind: 'image', url: 'https://example.com/one.jpg' },
        { kind: 'video', url: 'https://example.com/two.mp4' },
      ],
    });

    expect(internals.createContainer).toHaveBeenNthCalledWith(1, 'token', {
      media_type: 'IMAGE',
      image_url: 'https://example.com/one.jpg',
      is_carousel_item: 'true',
    });
    expect(internals.createContainer).toHaveBeenNthCalledWith(2, 'token', {
      media_type: 'VIDEO',
      video_url: 'https://example.com/two.mp4',
      is_carousel_item: 'true',
    });
    expect(internals.createContainer).toHaveBeenNthCalledWith(3, 'token', {
      media_type: 'CAROUSEL',
      children: 'image-child,video-child',
      text: 'Mixed',
    });
  });

  it('copies images, videos and ordered media metadata to the diary', async () => {
    prisma.note.create.mockResolvedValue({ id: 77 });
    const draft = post([media(1, 'video', 0), media(2, 'image', 1)]);

    await internals.copyToDiary(draft, 'https://threads.net/t/live-1');

    expect(prisma.note.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rawMessage: expect.objectContaining({
          media: [
            expect.objectContaining({ kind: 'video', sortOrder: 0 }),
            expect.objectContaining({ kind: 'image', sortOrder: 1 }),
          ],
        }),
        images: {
          create: [{ url: 'https://example.com/2.jpg', description: null }],
        },
        videos: {
          create: [{ url: 'https://example.com/1.mp4', description: null }],
        },
      }),
    });
  });
});

describe('ThreadsService fresh replies', () => {
  it('does not mark replies as new on the first dump', () => {
    expect(freshReplyIds(null, [{ id: 'a' }])).toEqual([]);
  });

  it('marks only ids that appeared since the previous dump', () => {
    expect(
      freshReplyIds({ replies: [{ id: 'a' }, { id: 'b' }] }, [
        { id: 'b' },
        { id: 'c' },
      ]),
    ).toEqual(['c']);
  });

  it('clears the new set when a later dump has no additions', () => {
    expect(
      freshReplyIds({ replies: [{ id: 'a' }, { id: 'b' }] }, [
        { id: 'a' },
        { id: 'b' },
      ]),
    ).toEqual([]);
  });

  it('stores fresh reply ids when insights refresh pulls new comments', async () => {
    const prisma = {
      threadsPost: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new ThreadsService(
      prisma as never,
      { deleteByPublicUrl: jest.fn() } as never,
      { get: jest.fn().mockReturnValue('token') } as never,
      { sendApiNoteText: jest.fn() } as never,
    );
    const internals = service as unknown as {
      graphGet(
        path: string,
        params: Record<string, string>,
      ): Promise<Record<string, unknown>>;
    };
    const existing = {
      ...post(),
      status: 'published',
      mediaId: 'media-1',
      url: 'https://threads.net/t/live-1',
      repliesJson: { replies: [{ id: 'old' }] },
    };
    const saved = {
      ...existing,
      repliesJson: {
        replies: [{ id: 'old' }, { id: 'new-1' }],
        freshIds: ['new-1'],
      },
    };
    prisma.threadsPost.findUnique.mockResolvedValue(existing);
    prisma.threadsPost.update.mockResolvedValue(saved);
    const graphGet = jest
      .spyOn(internals, 'graphGet')
      .mockImplementation(async (path) => {
        if (path.endsWith('/insights')) {
          return {
            data: [{ name: 'views', values: [{ value: 3 }] }],
          };
        }
        if (path.endsWith('/conversation')) {
          return { data: [{ id: 'old' }, { id: 'new-1' }] };
        }
        return { id: 'media-1', permalink: 'https://threads.net/t/live-1' };
      });

    const result = await service.refreshInsights(1);

    expect(result.replies).toEqual(
      expect.objectContaining({ freshIds: ['new-1'] }),
    );
    expect(prisma.threadsPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repliesJson: expect.objectContaining({
            freshIds: ['new-1'],
            replies: [{ id: 'old' }, { id: 'new-1' }],
          }),
        }),
      }),
    );
    expect(graphGet).toHaveBeenCalledTimes(5);
  });
});
