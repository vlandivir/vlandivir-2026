import {
  buildYandexFilename,
  sanitizeYandexPathPart,
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
});
