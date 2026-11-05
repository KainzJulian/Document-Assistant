import { Injectable, inject, signal } from '@angular/core';
import { ApiClient, ChatSummary } from '../core/api';

/** The sidebar chat list and chat search. */
@Injectable({ providedIn: 'root' })
export class ChatsStore {
  private readonly api = inject(ApiClient);

  /** The person's chats, newest first. */
  readonly chats = signal<ChatSummary[]>([]);
  /** Search results; null while there is no search text. */
  readonly results = signal<ChatSummary[] | null>(null);
  /** The current search text. */
  readonly query = signal('');

  /** Load all chats. */
  async load(): Promise<void> {
    this.chats.set(await this.api.get<ChatSummary[]>('/chats'));
  }

  /**
   * Search titles and messages (typo tolerant); an empty text clears the results.
   * @param text - The search text.
   */
  async search(text: string): Promise<void> {
    const q = text.trim();
    this.query.set(q);
    if (!q) {
      this.results.set(null);
      return;
    }
    const found = await this.api.get<ChatSummary[]>(`/chats?q=${encodeURIComponent(q)}`);
    if (this.query() === q) this.results.set(found);
  }

  /**
   * Update or add a chat in the list (after a new title or a new chat).
   * @param chat - The chat with its new data.
   */
  upsert(chat: Pick<ChatSummary, 'id' | 'title' | 'created_at' | 'updated_at'>): void {
    this.chats.update((list) => {
      const rest = list.filter((c) => c.id !== chat.id);
      const old = list.find((c) => c.id === chat.id);
      return [{ snippet: null, message_id: null, ...old, ...chat }, ...rest];
    });
  }

  /**
   * Rename a chat.
   * @param id - Id of the chat.
   * @param title - The new title.
   */
  async rename(id: string, title: string): Promise<void> {
    const updated = await this.api.patch<ChatSummary>(`/chats/${id}`, { title });
    this.chats.update((list) => list.map((c) => (c.id === id ? { ...c, title: updated.title } : c)));
  }

  /**
   * Delete a chat.
   * @param id - Id of the chat.
   */
  async remove(id: string): Promise<void> {
    await this.api.delete(`/chats/${id}`);
    this.chats.update((list) => list.filter((c) => c.id !== id));
    this.results.update((list) => (list ? list.filter((c) => c.id !== id) : list));
  }
}
