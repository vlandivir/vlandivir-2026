import {
  buildYandexFilename,
  describeYandexSyncError,
  isRetryableYandexUploadError,
  sanitizeYandexPathPart,
  TripYandexDiskService,
} from './trip-yandex-disk.service';

describe('TripYandexDiskService path helpers', () => {
  it('removes characters Yandex Disk does not allow in folder names', () => {
    expect(sanitizeYandexPathPart('  Черногория: 2026 / море?  ')).toBe(
      'Черногория 2026 море',
    );
  });

  it('keeps the original extension and adds a stable hash suffix', () => {
    expect(
      buildYandexFilename(
        'IMG_1234.HEIC',
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      ),
    ).toBe('IMG_1234__abcdef12.HEIC');
  });

  it('makes same-name originals unique without changing their quality', () => {
    const first = buildYandexFilename('photo.jpg', '11111111'.padEnd(64, '0'));
    const second = buildYandexFilename('photo.jpg', '22222222'.padEnd(64, '0'));
    expect(first).not.toBe(second);
  });

  it('keeps the underlying network error code in diagnostics', () => {
    const cause = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
    });
    const error = Object.assign(new TypeError('fetch failed'), { cause });
    expect(describeYandexSyncError(error)).toBe(
      'fetch failed — UND_ERR_SOCKET: other side closed',
    );
    expect(isRetryableYandexUploadError(error)).toBe(true);
    expect(
      isRetryableYandexUploadError(
        new Error('Яндекс Диск отклонил файл (400): bad request'),
      ),
    ).toBe(false);
    expect(
      isRetryableYandexUploadError(
        new Error(
          'Операция Яндекс Диска завершилась ошибкой: source temporarily unavailable',
        ),
      ),
    ).toBe(true);
  });

  it('gets a fresh source URL when a remote upload operation is retried', async () => {
    const storage = {
      getTripMediaPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValueOnce('https://spaces.test/source-1')
        .mockResolvedValueOnce('https://spaces.test/source-2'),
    };
    const config = { get: jest.fn().mockReturnValue('test-token') };
    const service = new TripYandexDiskService(
      {} as never,
      storage as never,
      config as never,
    );
    const networkError = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('other side closed'), {
        code: 'UND_ERR_SOCKET',
      }),
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ href: 'https://yandex.test/upload-1' }), {
          status: 202,
        }),
      )
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ href: 'https://yandex.test/upload-2' }), {
          status: 202,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'in-progress' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'success' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: 'file', size: 3 }), {
          status: 200,
        }),
      );
    const timeoutMock = jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: () => void,
    ) => {
      callback();
      return 0;
    }) as typeof setTimeout);

    type UploadHarness = {
      uploadMedia(
        media: {
          tripId: string;
          contentHash: string;
          originalFilename: string;
          mimeType: string;
          size: bigint;
        },
        path: string,
      ): Promise<void>;
    };

    try {
      await (service as unknown as UploadHarness).uploadMedia(
        {
          tripId: 'trip-1',
          contentHash: 'a'.repeat(64),
          originalFilename: 'large.mp4',
          mimeType: 'video/mp4',
          size: 3n,
        },
        'disk:/large.mp4',
      );
      expect(storage.getTripMediaPresignedDownloadUrl).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledTimes(6);
      const firstSubmitUrl = String(fetchMock.mock.calls[0][0]);
      expect(firstSubmitUrl).toContain('/resources/upload?');
      expect(firstSubmitUrl).toContain(
        'url=https%3A%2F%2Fspaces.test%2Fsource-1',
      );
      expect(firstSubmitUrl).toContain('path=disk%3A%2Flarge.mp4');
      expect(fetchMock.mock.calls[0][1]).toEqual(
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock.mock.calls[4][0]).toBe('https://yandex.test/upload-2');
    } finally {
      fetchMock.mockRestore();
      timeoutMock.mockRestore();
    }
  });
});
