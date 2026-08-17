import {
  buildGtdIndexText,
  contextMimeForName,
  sanitizeContextName,
} from './gtd-text';

describe('gtd-text', () => {
  it('sanitizes context filenames', () => {
    expect(sanitizeContextName(undefined)).toBe('context.md');
    expect(sanitizeContextName('ticket')).toBe('ticket.md');
    expect(sanitizeContextName('notes.txt')).toBe('notes.txt');
    expect(sanitizeContextName('a/b\\c.md')).toBe('a_b_c.md');
  });

  it('picks mime from the filename', () => {
    expect(contextMimeForName('context.md')).toBe('text/markdown');
    expect(contextMimeForName('notes.txt')).toBe('text/plain');
  });

  it('builds index text from content, project, snooze and attachments', () => {
    const text = buildGtdIndexText({
      content: 'Смонтировать ролик',
      status: 'ACTIVE',
      dueDate: new Date('2026-08-20T00:00:00.000Z'),
      snoozedUntil: new Date('2026-08-18T09:00:00.000Z'),
      project: { name: 'Видео' },
      attachments: [
        {
          originalName: 'сценарий.md',
          mimeType: 'text/markdown',
          text: 'Кадр 1: море',
        },
        {
          originalName: 'скрин.jpg',
          mimeType: 'image/jpeg',
          description: 'Карта маршрута',
        },
      ],
    });
    expect(text).toContain('Смонтировать ролик');
    expect(text).toContain('проект: Видео');
    expect(text).toContain('срок: 2026-08-20');
    expect(text).toContain('отложено до:');
    expect(text).toContain('статус: ACTIVE');
    expect(text).toContain('Кадр 1: море');
    expect(text).toContain('Карта маршрута');
  });
});
