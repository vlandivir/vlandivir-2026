import { GpxApiController } from './gpx-api.controller';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { StorageService } from './services/storage.service';
import type { ToolPagesService } from './services/tool-pages.service';

describe('GpxApiController', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gpx-api-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stores the uploaded GPX and returns a project manifest', async () => {
    const gpxPath = join(tmpDir, 'track.gpx');
    await writeFile(gpxPath, '<gpx></gpx>');
    const storage = {
      uploadStreamWithKey: jest.fn().mockImplementation(async (stream) => {
        for await (const chunk of stream) void chunk;
        return 'https://example.com/gpx/source.gpx';
      }),
    };
    const toolPages = {
      createHash: jest.fn().mockReturnValue('cccccccccccccccccccccccc'),
      artifactKey: jest.fn().mockReturnValue('gpx/projects/hash/source.gpx'),
      artifactFromUpload: jest.fn((input) => input),
      createManifest: jest.fn().mockResolvedValue({
        kind: 'gpx',
        hash: 'cccccccccccccccccccccccc',
        title: 'track',
        pageUrl: '/gpx-route-png/cccccccccccccccccccccccc',
        artifacts: [{ id: 'source', url: 'https://example.com/gpx/source.gpx' }],
      }),
      recordPageForRequest: jest.fn().mockResolvedValue(undefined),
      toUserPage: jest.fn((manifest) => manifest),
    };
    const controller = new GpxApiController(
      storage as unknown as StorageService,
      toolPages as unknown as ToolPagesService,
    );

    const result = await controller.createProject(
      {
        path: gpxPath,
        originalname: 'track.gpx',
        mimetype: 'application/gpx+xml',
        size: 11,
      },
      { headers: {} } as never,
    );

    expect(result.hash).toBe('cccccccccccccccccccccccc');
    expect(storage.uploadStreamWithKey).toHaveBeenCalled();
    expect(toolPages.createManifest).toHaveBeenCalled();
  });
});
