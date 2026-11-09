/** What the sidebar needs to know about a chat. */
export interface ChatListItem {
  id: string;
  title: string | null;
  updated_at: string;
}

/** A date group of the chat list. */
export interface ChatGroup<T extends ChatListItem = ChatListItem> {
  name: 'Heute' | 'Gestern' | 'Letzte 7 Tage' | 'Älter';
  chats: T[];
}

/**
 * Group chats by how recently they were used, newest first.
 * @param chats - The chats.
 * @param now - Reference time (for testing).
 * @returns The non-empty groups: Heute, Gestern, Letzte 7 Tage, Älter.
 */
export function groupChats<T extends ChatListItem>(chats: T[], now: Date = new Date()): ChatGroup<T>[] {
  const day = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const groups: ChatGroup<T>[] = [
    { name: 'Heute', chats: [] },
    { name: 'Gestern', chats: [] },
    { name: 'Letzte 7 Tage', chats: [] },
    { name: 'Älter', chats: [] },
  ];
  const sorted = [...chats].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  for (const chat of sorted) {
    const days = Math.round((day(now) - day(new Date(chat.updated_at))) / 86_400_000);
    groups[days <= 0 ? 0 : days === 1 ? 1 : days <= 7 ? 2 : 3].chats.push(chat);
  }
  return groups.filter((g) => g.chats.length > 0);
}

/** A piece of a search snippet; `mark` is true for the matched word. */
export interface SnippetPart {
  text: string;
  mark: boolean;
}

/**
 * Split a search snippet at its `[[match]]` markers so the match can be highlighted.
 * @param snippet - Snippet as returned by the API.
 * @returns The parts in order.
 */
export function snippetParts(snippet: string): SnippetPart[] {
  return snippet
    .split(/(\[\[.*?\]\])/)
    .filter(Boolean)
    .map((part) => (part.startsWith('[[') && part.endsWith(']]') ? { text: part.slice(2, -2), mark: true } : { text: part, mark: false }));
}
