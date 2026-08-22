import {
  LIMIT_CHARS,
  normalizeTopicTag,
  parsePollOptions,
  splitIntoPosts,
  ThreadsTextError,
} from './threads-text';

describe('splitIntoPosts', () => {
  it('returns empty for blank text', () => {
    expect(splitIntoPosts('')).toEqual([]);
    expect(splitIntoPosts('   \n')).toEqual([]);
  });

  it('keeps a short post as one chunk', () => {
    expect(splitIntoPosts('Привет')).toEqual(['Привет']);
  });

  it('packs paragraphs that fit together', () => {
    expect(splitIntoPosts('один\n\nдва')).toEqual(['один\n\nдва']);
  });

  it('splits when the second paragraph would overflow', () => {
    const first = 'а'.repeat(400);
    const second = 'б'.repeat(200);
    const parts = splitIntoPosts(`${first}\n\n${second}`);
    expect(parts).toEqual([first, second]);
    expect(parts.every((part) => part.length <= LIMIT_CHARS)).toBe(true);
  });

  it('splits an overlong paragraph by sentences', () => {
    const a = 'А'.repeat(300) + '.';
    const b = 'Б'.repeat(300) + '.';
    const parts = splitIntoPosts(`${a} ${b}`);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= LIMIT_CHARS)).toBe(true);
  });
});

describe('normalizeTopicTag', () => {
  it('strips a leading hash', () => {
    expect(normalizeTopicTag('#AI')).toBe('AI');
  });

  it('returns empty for blank', () => {
    expect(normalizeTopicTag('  ')).toBe('');
  });

  it('rejects spaces, periods and ampersands', () => {
    expect(() => normalizeTopicTag('Hello world')).toThrow(ThreadsTextError);
    expect(() => normalizeTopicTag('AI.tech')).toThrow(ThreadsTextError);
    expect(() => normalizeTopicTag('A&B')).toThrow(ThreadsTextError);
  });

  it('rejects tags longer than 50 characters', () => {
    expect(() => normalizeTopicTag('a'.repeat(51))).toThrow(ThreadsTextError);
  });
});

describe('parsePollOptions', () => {
  it('parses a pipe-separated string', () => {
    expect(parsePollOptions('да|нет')).toEqual(['да', 'нет']);
  });

  it('accepts an array', () => {
    expect(parsePollOptions(['да', 'нет'])).toEqual(['да', 'нет']);
  });

  it('rejects fewer than two or more than four options', () => {
    expect(() => parsePollOptions('только')).toThrow(ThreadsTextError);
    expect(() => parsePollOptions('a|b|c|d|e')).toThrow(ThreadsTextError);
  });

  it('rejects options over 25 UTF-8 bytes', () => {
    // 13 cyrillic letters = 26 bytes
    expect(() => parsePollOptions(['abcdefghij', 'абвгдеёжзийкл'])).toThrow(
      ThreadsTextError,
    );
  });
});
