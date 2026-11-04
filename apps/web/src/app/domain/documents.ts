/** One page (or slide) of an extracted document; `page` is null for text before the first marker. */
export interface PageSection {
  page: number | null;
  text: string;
}

const MARKER = /^<!--page:(\d+)-->\s*$/m;

/**
 * Split the extracted Markdown at its `<!--page:N-->` markers.
 * @param markdown - Text as returned by the API.
 * @returns The sections in order; a document without markers is one section with `page` null.
 */
export function splitPages(markdown: string): PageSection[] {
  const sections: PageSection[] = [];
  let page: number | null = null;
  let buffer: string[] = [];
  const flush = (): void => {
    const text = buffer.join('\n').trim();
    if (text) sections.push({ page, text });
    buffer = [];
  };
  for (const line of markdown.split('\n')) {
    const match = MARKER.exec(line);
    if (match) {
      flush();
      page = Number(match[1]);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Format a byte count for people, with a German decimal comma.
 * @param bytes - Size in bytes, or null if unknown.
 * @returns For example `2,4 MB`; an empty string for null.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 ? String(value) : value.toFixed(value < 10 ? 1 : 0).replace('.', ',');
  return `${text} ${units[unit]}`;
}

/**
 * Format a timestamp relative to today.
 * @param iso - ISO timestamp.
 * @param now - Reference time (for testing).
 * @returns `Heute`, `Gestern` or a date like `03.11.2026`.
 */
export function formatDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const day = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** A block of extracted text: a heading (level 1 to 6) or a paragraph (level 0). */
export interface TextBlock {
  level: number;
  text: string;
}

/**
 * Split text into headings and paragraphs so Markdown headings are not shown as `#` lines.
 * @param text - Text of one page section.
 * @returns The blocks in order.
 */
export function toBlocks(text: string): TextBlock[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const match = /^(#{1,6})\s+(.*)$/s.exec(block);
      return match ? { level: match[1].length, text: match[2] } : { level: 0, text: block };
    });
}
