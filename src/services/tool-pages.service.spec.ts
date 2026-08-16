import { ToolPagesService } from './tool-pages.service';
import type { StorageService } from './storage.service';
import type { AuthService } from '../auth/auth.service';

describe('ToolPagesService', () => {
  const storage = {
    getJsonByKey: jest.fn(),
    putPublicJson: jest.fn(),
    putPrivateJson: jest.fn(),
  };
  const auth = {
    getSessionFromRequest: jest.fn(),
  };
  const service = new ToolPagesService(
    storage as unknown as StorageService,
    auth as unknown as AuthService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('replaces an artifact with the same id in the manifest', async () => {
    storage.getJsonByKey.mockResolvedValue({
      kind: 'subs',
      hash: 'abcabcabcabcabcabcabcabc',
      title: 'ride.mp4',
      pageUrl: '/subs/abcabcabcabcabcabcabcabc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [
        {
          id: 'source',
          name: 'ride.mp4',
          url: 'https://example.com/source',
          mimeType: 'video/mp4',
          size: 10,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    storage.putPublicJson.mockResolvedValue('https://example.com/manifest');

    const manifest = await service.upsertArtifact('subs', 'abcabcabcabcabcabcabcabc', {
      id: 'audio',
      name: 'audio.mp3',
      url: 'https://example.com/audio',
      mimeType: 'audio/mpeg',
      size: 4,
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    expect(manifest.artifacts.map((item) => item.id)).toEqual(['audio', 'source']);
    expect(storage.putPublicJson).toHaveBeenCalled();
  });

  it('keeps at most 200 pages per user', async () => {
    const existing = Array.from({ length: 200 }, (_, index) => ({
      kind: 'subs' as const,
      hash: String(index).padStart(24, 'a'),
      title: `p${index}`,
      pageUrl: `/subs/${String(index).padStart(24, 'a')}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
    }));
    storage.getJsonByKey.mockResolvedValue({ pages: existing });

    const pages = await service.upsertUserPage('friend@gmail.com', {
      kind: 'gpx',
      hash: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      title: 'new',
      pageUrl: '/gpx-route-png/bbbbbbbbbbbbbbbbbbbbbbbb',
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(pages).toHaveLength(200);
    expect(pages[0].hash).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(storage.putPrivateJson).toHaveBeenCalled();
  });

  it('imports local pages without overwriting an earlier createdAt', async () => {
    storage.getJsonByKey.mockResolvedValue({
      pages: [
        {
          kind: 'subs',
          hash: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          title: 'server title',
          pageUrl: '/subs/aaaaaaaaaaaaaaaaaaaaaaaa',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    const pages = await service.importUserPages('friend@gmail.com', [
      {
        kind: 'subs',
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        title: 'local title',
        pageUrl: '/subs/aaaaaaaaaaaaaaaaaaaaaaaa',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
      },
      {
        kind: 'gpx',
        hash: 'cccccccccccccccccccccccc',
        title: 'from this browser',
        pageUrl: '/gpx-route-png/cccccccccccccccccccccccc',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ]);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      hash: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'local title',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    expect(pages[1].hash).toBe('cccccccccccccccccccccccc');
  });
});
