import {
  buildYandexFilename,
  buildYandexUploadHeaders,
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

  it('sends an exact content length for streamed originals', () => {
    expect(buildYandexUploadHeaders('video/mp4', 569_191_939n)).toEqual({
      'Content-Type': 'video/mp4',
      'Content-Length': '569191939',
    });
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
  });

  it('gets fresh source and upload URLs when a streamed upload is retried', async () => {
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
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.of(1, 2, 3)))
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ href: 'https://yandex.test/upload-2' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.of(1, 2, 3)))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
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
      expect(fetchMock.mock.calls[2][1]).toEqual(
        expect.objectContaining({
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': '3',
          },
        }),
      );
      expect(fetchMock.mock.calls[5][0]).toBe('https://yandex.test/upload-2');
    } finally {
      fetchMock.mockRestore();
      timeoutMock.mockRestore();
    }
  });
});
