import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('finds bold, italic, code and citations', () => {
    expect(parseInline('Das ist **wichtig**, *kursiv* und `code` [2]')).toEqual([
      { t: 'text', v: 'Das ist ' },
      { t: 'bold', v: 'wichtig' },
      { t: 'text', v: ', ' },
      { t: 'italic', v: 'kursiv' },
      { t: 'text', v: ' und ' },
      { t: 'code', v: 'code' },
      { t: 'text', v: ' ' },
      { t: 'cite', n: 2 },
    ]);
  });

  it('keeps unfinished markers as text while an answer streams', () => {
    expect(parseInline('Das ist **halb')).toEqual([{ t: 'text', v: 'Das ist **halb' }]);
  });

  it('does not turn brackets without a number into citations', () => {
    expect(parseInline('[abc] und [123]')).toEqual([{ t: 'text', v: '[abc] und [123]' }]);
  });
});

describe('parseMarkdown', () => {
  it('builds paragraphs, headings and lists', () => {
    const blocks = parseMarkdown('# Titel\n\nErste Zeile\nzweite Zeile\n\n- eins\n- zwei\n\n1. a\n2. b');
    expect(blocks.map((b) => b.k)).toEqual(['h', 'p', 'ul', 'ol']);
    expect(blocks[1]).toEqual({ k: 'p', inline: [{ t: 'text', v: 'Erste Zeile zweite Zeile' }] });
    expect(blocks[2]).toMatchObject({ k: 'ul', items: [[{ t: 'text', v: 'eins' }], [{ t: 'text', v: 'zwei' }]] });
  });

  it('keeps fenced code verbatim, also when unfinished', () => {
    expect(parseMarkdown('```\na **b**\n```')).toEqual([{ k: 'code', text: 'a **b**' }]);
    expect(parseMarkdown('```\nnoch offen')).toEqual([{ k: 'code', text: 'noch offen' }]);
  });

  it('never produces HTML: tags stay plain text', () => {
    const [block] = parseMarkdown('<script>alert(1)</script> [1]');
    expect(block).toEqual({
      k: 'p',
      inline: [
        { t: 'text', v: '<script>alert(1)</script> ' },
        { t: 'cite', n: 1 },
      ],
    });
  });

  it('returns nothing for empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
