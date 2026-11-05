import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, splitPages, toBlocks } from './documents';

describe('splitPages', () => {
  it('splits at page markers', () => {
    expect(splitPages('<!--page:1-->\nEins\n<!--page:2-->\nZwei')).toEqual([
      { page: 1, text: 'Eins' },
      { page: 2, text: 'Zwei' },
    ]);
  });

  it('gives one section without page for text without markers', () => {
    expect(splitPages('Nur Text')).toEqual([{ page: null, text: 'Nur Text' }]);
  });

  it('skips empty pages and empty input', () => {
    expect(splitPages('<!--page:1-->\n\n<!--page:2-->\nZwei')).toEqual([{ page: 2, text: 'Zwei' }]);
    expect(splitPages('')).toEqual([]);
  });
});

describe('formatBytes', () => {
  it('uses a German decimal comma', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2,4 MB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
  });
});

describe('formatDate', () => {
  const now = new Date(2026, 10, 5, 12, 0);

  it('says Heute and Gestern', () => {
    expect(formatDate(new Date(2026, 10, 5, 8, 0).toISOString(), now)).toBe('Heute');
    expect(formatDate(new Date(2026, 10, 4, 23, 0).toISOString(), now)).toBe('Gestern');
  });

  it('prints older dates as dd.mm.yyyy', () => {
    expect(formatDate(new Date(2026, 9, 3, 12, 0).toISOString(), now)).toBe('03.10.2026');
  });
});

describe('toBlocks', () => {
  it('separates headings from paragraphs', () => {
    expect(toBlocks('## Kapitel\n\nText eins\n\n\nText zwei')).toEqual([
      { level: 2, text: 'Kapitel' },
      { level: 0, text: 'Text eins' },
      { level: 0, text: 'Text zwei' },
    ]);
  });
});
