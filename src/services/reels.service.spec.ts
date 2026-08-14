import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReelsService } from './reels.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { EmbeddingsService } from './embeddings.service';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('ReelsService.processInBackground', () => {
  let service: ReelsService;
  let reelUpdate: jest.Mock;

  beforeEach(async () => {
    reelUpdate = jest.fn().mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReelsService,
        {
          provide: PrismaService,
          useValue: {
            reel: {
              findUnique: jest.fn().mockResolvedValue(null),
              update: reelUpdate,
            },
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: StorageService, useValue: {} },
        { provide: EmbeddingsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
  });

  it('fires onComplete after a successful process', async () => {
    jest
      .spyOn(
        service as unknown as { process: (id: number) => Promise<void> },
        'process',
      )
      .mockResolvedValue(undefined);
    const onComplete = jest.fn();

    service.processInBackground(42, onComplete);
    await flushPromises();

    expect(onComplete).toHaveBeenCalledWith(42);
  });

  it('marks the reel as errored and still fires onComplete on failure', async () => {
    jest
      .spyOn(
        service as unknown as { process: (id: number) => Promise<void> },
        'process',
      )
      .mockRejectedValue(new Error('yt-dlp exploded'));
    const onComplete = jest.fn();

    service.processInBackground(43, onComplete);
    await flushPromises();
    await flushPromises();

    expect(reelUpdate).toHaveBeenCalledWith({
      where: { id: 43 },
      data: { status: 'error', error: 'yt-dlp exploded' },
    });
    expect(onComplete).toHaveBeenCalledWith(43);
  });

  it('does not throw when no onComplete is provided', async () => {
    jest
      .spyOn(
        service as unknown as { process: (id: number) => Promise<void> },
        'process',
      )
      .mockResolvedValue(undefined);

    expect(() => service.processInBackground(44)).not.toThrow();
    await flushPromises();
  });
});

describe('ReelsService.isOwnAuthor', () => {
  const build = async (configured?: string) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReelsService,
        { provide: PrismaService, useValue: { reel: {} } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(configured) },
        },
        { provide: StorageService, useValue: {} },
        { provide: EmbeddingsService, useValue: {} },
      ],
    }).compile();
    return module.get<ReelsService>(ReelsService);
  };

  it('matches the default handle case-insensitively, ignoring @', async () => {
    const service = await build(undefined);
    expect(service.isOwnAuthor('vlandivir')).toBe(true);
    expect(service.isOwnAuthor('@Vlandivir')).toBe(true);
    expect(service.isOwnAuthor('someone_else')).toBe(false);
    expect(service.isOwnAuthor(null)).toBe(false);
  });

  it('honours a configured comma-separated list', async () => {
    const service = await build('alpha, @Beta ');
    expect(service.isOwnAuthor('alpha')).toBe(true);
    expect(service.isOwnAuthor('beta')).toBe(true);
    expect(service.isOwnAuthor('vlandivir')).toBe(false);
  });
});
