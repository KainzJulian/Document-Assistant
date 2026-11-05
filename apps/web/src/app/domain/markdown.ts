/** A piece of text inside a block: plain, bold, italic, code, or a citation marker like [2]. */
export type Inline =
  | { t: 'text' | 'bold' | 'italic' | 'code'; v: string }
  | { t: 'cite'; n: number };

/** A block of an answer. Rendered by the template, never as raw HTML. */
export type Block =
  | { k: 'p'; inline: Inline[] }
  | { k: 'h'; level: number; inline: Inline[] }
  | { k: 'ul' | 'ol'; items: Inline[][] }
  | { k: 'code'; text: string };

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[\d{1,2}\])/g;

/**
 * Split a line of text into plain, bold, italic, code and citation pieces.
 *
 * @param text - One paragraph or list item.
 * @returns The pieces in order.
 */
export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) result.push({ t: 'bold', v: part.slice(2, -2) });
    else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) result.push({ t: 'italic', v: part.slice(1, -1) });
    else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) result.push({ t: 'code', v: part.slice(1, -1) });
    else if (/^\[\d{1,2}\]$/.test(part)) result.push({ t: 'cite', n: Number(part.slice(1, -1)) });
    else result.push({ t: 'text', v: part });
  }
  return result;
}

/**
 * Parse the Markdown subset models use in answers: paragraphs, headings, bullet and numbered lists,
 * fenced code, bold, italic, inline code. Everything else stays plain text, so there is no HTML
 * to sanitise.
 *
 * @param source - The answer text (may be unfinished while streaming).
 * @returns The blocks in order.
 */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { k: 'ul' | 'ol'; items: Inline[][] } | null = null;
  let code: string[] | null = null;

  const endParagraph = (): void => {
    if (paragraph.length) blocks.push({ k: 'p', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const endList = (): void => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const line of source.split('\n')) {
    if (line.trim().startsWith('```')) {
      if (code) {
        blocks.push({ k: 'code', text: code.join('\n') });
        code = null;
      } else {
        endParagraph();
        endList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      endParagraph();
      endList();
      blocks.push({ k: 'h', level: heading[1].length, inline: parseInline(heading[2]) });
    } else if (bullet || numbered) {
      endParagraph();
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.k !== kind) {
        endList();
        list = { k: kind, items: [] };
      }
      list.items.push(parseInline((bullet ?? numbered)?.[1] ?? ''));
    } else if (!line.trim()) {
      endParagraph();
      endList();
    } else {
      endList();
      paragraph.push(line.trim());
    }
  }
  if (code) blocks.push({ k: 'code', text: code.join('\n') });
  endParagraph();
  endList();
  return blocks;
}
