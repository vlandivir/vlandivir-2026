import {
  VIDEO_INDEX_HEADING,
  formatVideoIndex,
  mergeNoteWithVideoIndex,
  stripVideoIndex,
} from './diary-video-note';

describe('formatVideoIndex', () => {
  it('joins title, caption, Instagram URL, tags, transcript and vision', () => {
    const text = formatVideoIndex({
      title: 'Манасија',
      description: 'Подпись к ролику',
      instagramUrl: 'https://www.instagram.com/p/Abc/',
      shortcode: 'Abc',
      tags: ['сербия', ''],
      transcriptClean: 'Говорят, что деспот Стефан…',
      visionDescription: 'Панорама монастыря.',
    });
    expect(text).toContain('Манасија');
    expect(text).toContain('Подпись к ролику');
    expect(text).toContain('https://www.instagram.com/p/Abc/');
    expect(text).toContain('Теги: сербия');
    expect(text).toContain('Расшифровка:\nГоворят, что деспот Стефан…');
    expect(text).toContain('Что на экране:\nПанорама монастыря.');
  });

  it('skips the diary-v proxy URL and prefers transcriptClean', () => {
    const text = formatVideoIndex({
      title: 'Котелок',
      instagramUrl: 'https://vlandivir.com/diary/video/14',
      shortcode: 'diary-v14',
      transcript: 'сырой',
      transcriptClean: 'чистый',
    });
    expect(text).toContain('чистый');
    expect(text).not.toContain('сырой');
    expect(text).not.toContain('vlandivir.com/diary/video');
  });
});

describe('mergeNoteWithVideoIndex', () => {
  const index =
    'Заголовок\n\nhttps://www.instagram.com/p/Abc/\n\nРасшифровка:\nпривет';

  it('uses only the generated block when the note is empty', () => {
    expect(mergeNoteWithVideoIndex('', index)).toBe(
      `${VIDEO_INDEX_HEADING}\n\n${index}`,
    );
  });

  it('drops an old caption+URL mirror that is already in the index', () => {
    const old = 'Подпись к ролику\n\nhttps://www.instagram.com/p/Abc/';
    const full = formatVideoIndex({
      title: 'Заголовок',
      description: 'Подпись к ролику',
      instagramUrl: 'https://www.instagram.com/p/Abc/',
      shortcode: 'Abc',
      transcript: 'привет',
    });
    const merged = mergeNoteWithVideoIndex(old, full);
    expect(merged.startsWith(VIDEO_INDEX_HEADING)).toBe(true);
    expect(merged).toContain('Расшифровка:\nпривет');
    expect(merged.indexOf('Подпись к ролику')).toBe(
      merged.lastIndexOf('Подпись к ролику'),
    );
  });

  it('keeps personal diary text above a replaceable video block', () => {
    const existing = 'Ходил в Мостар и снял это вечером.';
    const merged = mergeNoteWithVideoIndex(existing, index);
    expect(merged.startsWith(existing)).toBe(true);
    expect(merged).toContain(VIDEO_INDEX_HEADING);
    expect(merged).toContain('Расшифровка:\nпривет');
  });

  it('replaces a previous generated block without duplicating user text', () => {
    const first = mergeNoteWithVideoIndex('Личная заметка', index);
    const updated = mergeNoteWithVideoIndex(
      first,
      'Новый заголовок\n\nРасшифровка:\nновое',
    );
    expect(updated.startsWith('Личная заметка')).toBe(true);
    expect(updated).toContain('Новый заголовок');
    expect(updated).not.toContain('привет');
    expect(updated.split(VIDEO_INDEX_HEADING).length).toBe(2);
  });
});

describe('stripVideoIndex', () => {
  it('returns empty when the whole note is a generated block', () => {
    expect(stripVideoIndex(`${VIDEO_INDEX_HEADING}\n\nЗаголовок`)).toBe('');
  });
});
