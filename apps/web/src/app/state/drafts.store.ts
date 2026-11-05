import { Injectable, signal } from '@angular/core';

/** Text and selections typed but not sent yet, so switching pages does not lose them. */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  private readonly chatDrafts = new Map<string, string>();

  /** Question typed on "Neuer Chat". */
  readonly newChatText = signal('');
  /** Documents ticked on "Neuer Chat". */
  readonly newChatSelected = signal<string[]>([]);

  /**
   * The unsent question of a chat.
   * @param chatId - Id of the chat.
   * @returns The draft, or an empty string.
   */
  chatDraft(chatId: string): string {
    return this.chatDrafts.get(chatId) ?? '';
  }

  /**
   * Remember the unsent question of a chat.
   * @param chatId - Id of the chat.
   * @param text - The draft ("" clears it).
   */
  setChatDraft(chatId: string, text: string): void {
    if (text) this.chatDrafts.set(chatId, text);
    else this.chatDrafts.delete(chatId);
  }
}
