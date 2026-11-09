import { describe, expect, it } from 'vitest';
import { groupChats, snippetParts } from './chats';

describe('groupChats', () => {
  const now = new Date(2026, 10, 5, 12, 0);
  const at = (day: number, hour = 10): string => new Date(2026, 10, day, hour).toISOString();

  it('groups by recency, newest first, and drops empty groups', () => {
    const groups = groupChats(
      [
        { id: 'a', title: 'a', updated_at: at(5, 8) },
        { id: 'b', title: 'b', updated_at: at(5, 11) },
        { id: 'c', title: 'c', updated_at: at(4) },
        { id: 'd', title: 'd', updated_at: at(1) },
        { id: 'e', title: 'e', updated_at: new Date(2026, 8, 1).toISOString() },
      ],
      now,
    );
    expect(groups.map((g) => g.name)).toEqual(['Heute', 'Gestern', 'Letzte 7 Tage', 'Älter']);
    expect(groups[0].chats.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('returns no groups for no chats', () => {
    expect(groupChats([], now)).toEqual([]);
  });
});

describe('snippetParts', () => {
  it('marks the matched word', () => {
    expect(snippetParts('die [[Kündigung]] erfolgt schriftlich')).toEqual([
      { text: 'die ', mark: false },
      { text: 'Kündigung', mark: true },
      { text: ' erfolgt schriftlich', mark: false },
    ]);
  });

  it('keeps text without markers as one part', () => {
    expect(snippetParts('nichts markiert')).toEqual([{ text: 'nichts markiert', mark: false }]);
  });
});
