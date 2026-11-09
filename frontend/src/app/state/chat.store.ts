import { Injectable, inject, signal } from '@angular/core';
import { ApiClient, ApiRequestError, ChatDetail, Citation } from '../core/api';
import { de } from '../core/i18n/de';
import { streamPost } from '../core/sse';
import { ChatsStore } from './chats.store';

/** A message as shown on screen (saved messages plus the one being streamed). */
export interface MessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  interrupted: boolean;
  /** Set when the answer failed; shown instead of the missing text. */
  error: string;
  streaming: boolean;
}

/** The open chat: its messages, the streamed answer, stop, regenerate, rename, documents. */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(ApiClient);
  private readonly chats = inject(ChatsStore);
  private abort: AbortController | null = null;
  private nextLocalId = 0;

  /** The chat, or null. */
  readonly chat = signal<ChatDetail | null>(null);
  /** Messages in order. */
  readonly messages = signal<MessageView[]>([]);
  /** True while an answer streams. */
  readonly busy = signal(false);
  /** Error of the last send that failed before an answer started (for example "no model chosen"). */
  readonly sendError = signal('');
  /** The first question of a new chat; the chat page sends it right after it opens. */
  pendingFirst: { chatId: string; text: string } | null = null;

  /**
   * Open a chat.
   * @param id - Id of the chat.
   */
  async open(id: string): Promise<void> {
    this.stop();
    this.sendError.set('');
    const chat = await this.api.get<ChatDetail>(`/chats/${id}`);
    this.chat.set(chat);
    this.messages.set(
      chat.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations,
        interrupted: m.interrupted,
        error: '',
        streaming: false,
      })),
    );
  }

  /** Forget the open chat. */
  close(): void {
    this.stop();
    this.chat.set(null);
    this.messages.set([]);
  }

  /**
   * Ask a question and stream the answer.
   * @param text - The question.
   */
  async send(text: string): Promise<void> {
    const chat = this.chat();
    if (!chat || this.busy()) return;
    this.messages.update((list) => [...list, this.local('user', text, false), this.local('assistant', '', true)]);
    await this.run(`/chats/${chat.id}/messages`, { content: text });
  }

  /** Create the last answer again. */
  async regenerate(): Promise<void> {
    const chat = this.chat();
    const last = this.messages().at(-1);
    if (!chat || !last || last.role !== 'assistant' || this.busy()) return;
    this.messages.update((list) => [...list.slice(0, -1), this.local('assistant', '', true)]);
    await this.run(`/chats/${chat.id}/messages/${last.id}/regenerate`, undefined);
  }

  /** Stop the streaming answer; what arrived so far stays, marked "abgebrochen". */
  stop(): void {
    this.abort?.abort();
  }

  /**
   * Rename the open chat.
   * @param title - The new title.
   */
  async rename(title: string): Promise<void> {
    const chat = this.chat();
    if (!chat) return;
    await this.chats.rename(chat.id, title);
    this.chat.set({ ...chat, title });
  }

  /**
   * Change the documents of the open chat.
   * @param ids - Ids of the selected documents.
   */
  async setDocuments(ids: string[]): Promise<void> {
    const chat = this.chat();
    if (!chat) return;
    this.chat.set(await this.api.patch<ChatDetail>(`/chats/${chat.id}`, { document_ids: ids }));
  }

  /**
   * Build a local message.
   * @param role - `user` or `assistant`.
   * @param content - Text so far.
   * @param streaming - Whether it is still being written.
   * @returns The message view.
   */
  private local(role: 'user' | 'assistant', content: string, streaming: boolean): MessageView {
    return { id: `local-${this.nextLocalId++}`, role, content, citations: [], interrupted: false, error: '', streaming };
  }

  /**
   * Change the last (streaming) message.
   * @param patch - Fields to change.
   */
  private patchLast(patch: Partial<MessageView>): void {
    this.messages.update((list) => list.map((m, i) => (i === list.length - 1 ? { ...m, ...patch } : m)));
  }

  /**
   * Stream one answer into the last message.
   * @param path - API path of the streaming endpoint.
   * @param body - Request body, if any.
   */
  private async run(path: string, body: unknown): Promise<void> {
    this.abort = new AbortController();
    this.busy.set(true);
    this.sendError.set('');
    let text = '';
    try {
      await streamPost(
        path,
        body,
        ({ event, data }) => {
          const payload = data as Record<string, unknown>;
          if (event === 'token') {
            text += String(payload['text']);
            this.patchLast({ content: text });
          } else if (event === 'citations') {
            this.patchLast({ citations: data as Citation[] });
          } else if (event === 'done') {
            this.patchLast({ id: String(payload['message_id']), streaming: false });
          } else if (event === 'title') {
            const chat = this.chat();
            if (chat) {
              this.chat.set({ ...chat, title: String(payload['title']) });
              this.chats.upsert({ id: chat.id, title: String(payload['title']), created_at: chat.created_at, updated_at: new Date().toISOString() });
            }
          } else if (event === 'error') {
            this.patchLast({ error: String(payload['message']), streaming: false });
          }
        },
        this.abort.signal,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        this.patchLast({ interrupted: true, streaming: false });
      } else if (e instanceof ApiRequestError && e.status !== 0) {
        // The server refused before streaming: take the empty answer (and the question) back.
        const chatId = this.chat()?.id;
        if (path.endsWith('/regenerate') && chatId) await this.open(chatId);
        else this.messages.update((list) => list.slice(0, -2));
        this.sendError.set(e.message);
      } else {
        this.patchLast({ error: de.chat.answerFailed, streaming: false });
      }
    } finally {
      this.busy.set(false);
      this.abort = null;
      this.patchLast({ streaming: false });
      const chat = this.chat();
      if (chat) this.chats.upsert({ id: chat.id, title: chat.title, created_at: chat.created_at, updated_at: new Date().toISOString() });
    }
  }
}
