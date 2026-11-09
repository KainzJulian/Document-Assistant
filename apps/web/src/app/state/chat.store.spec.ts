import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../../testing/create';
import { ApiClient, ApiRequestError, ChatDetail } from '../core/api';
import { de } from '../core/i18n/de';
import { SseEvent, streamPost } from '../core/sse';
import { ChatStore } from './chat.store';
import { ChatsStore } from './chats.store';

vi.mock('../core/sse', () => ({ streamPost: vi.fn() }));

const stream = vi.mocked(streamPost);

const detail: ChatDetail = {
  id: 'c1',
  title: null,
  provider: null,
  model: null,
  created_at: '2026-11-05T09:00:00Z',
  updated_at: '2026-11-05T09:00:00Z',
  documents: [],
  messages: [
    { id: 'm1', role: 'user', content: 'Frage', citations: [], provider: null, model: null, interrupted: false, created_at: '2026-11-05T09:00:00Z' },
    { id: 'm2', role: 'assistant', content: 'Antwort', citations: [], provider: 'ollama', model: 'x', interrupted: true, created_at: '2026-11-05T09:00:01Z' },
  ],
};

const citation = { n: 1, chunk_id: 'k1', document_id: 'd1', document_title: 'Titel', page_from: 1, page_to: 1, section_path: null };

/** Make the mocked stream deliver these events. */
function emit(...events: SseEvent[]): void {
  stream.mockImplementation(async (_path, _body, onEvent) => {
    for (const e of events) onEvent(e);
  });
}

function setup(): { store: ChatStore; api: { get: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> }; chats: { upsert: ReturnType<typeof vi.fn>; rename: ReturnType<typeof vi.fn> } } {
  const api = { get: vi.fn().mockResolvedValue(structuredClone(detail)), patch: vi.fn() };
  const chats = { upsert: vi.fn(), rename: vi.fn().mockResolvedValue(undefined) };
  const store = create(ChatStore, [
    { provide: ApiClient, useValue: api },
    { provide: ChatsStore, useValue: chats },
  ]);
  return { store, api, chats };
}

beforeEach(() => stream.mockReset());

describe('ChatStore', () => {
  it('opens a chat and marks interrupted answers', async () => {
    const { store, api } = setup();
    await store.open('c1');
    expect(api.get).toHaveBeenCalledWith('/chats/c1');
    expect(store.messages().map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(store.messages()[1].interrupted).toBe(true);
    store.close();
    expect(store.chat()).toBeNull();
    expect(store.messages()).toEqual([]);
  });

  it('streams tokens into a new answer, then citations and the saved id', async () => {
    const { store, chats } = setup();
    await store.open('c1');
    emit(
      { event: 'token', data: { text: 'Laut ' } },
      { event: 'token', data: { text: 'Quelle [1]' } },
      { event: 'citations', data: [citation] },
      { event: 'done', data: { message_id: 'm9', tokens_in: 1, tokens_out: 2 } },
      { event: 'title', data: { title: 'Fragen zu Quellen' } },
    );
    await store.send('Noch eine Frage');
    const [question, answer] = store.messages().slice(-2);
    expect(question).toMatchObject({ role: 'user', content: 'Noch eine Frage' });
    expect(answer).toMatchObject({ id: 'm9', role: 'assistant', content: 'Laut Quelle [1]', streaming: false, error: '' });
    expect(answer.citations).toEqual([citation]);
    expect(store.chat()?.title).toBe('Fragen zu Quellen');
    expect(store.busy()).toBe(false);
    expect(chats.upsert).toHaveBeenCalled();
    expect(stream.mock.calls[0][0]).toBe('/chats/c1/messages');
    expect(stream.mock.calls[0][1]).toEqual({ content: 'Noch eine Frage' });
  });

  it('shows an error event instead of the missing text', async () => {
    const { store } = setup();
    await store.open('c1');
    emit({ event: 'error', data: { message: 'Der API-Schlüssel wurde abgelehnt oder fehlt.' } });
    await store.send('Frage');
    expect(store.messages().at(-1)).toMatchObject({ error: 'Der API-Schlüssel wurde abgelehnt oder fehlt.', streaming: false });
  });

  it('keeps what arrived when the person stops, marked as interrupted', async () => {
    const { store } = setup();
    await store.open('c1');
    stream.mockImplementation(async (_p, _b, onEvent) => {
      onEvent({ event: 'token', data: { text: 'Halber Sat' } });
      throw new DOMException('aborted', 'AbortError');
    });
    await store.send('Frage');
    expect(store.messages().at(-1)).toMatchObject({ content: 'Halber Sat', interrupted: true, streaming: false });
    expect(store.busy()).toBe(false);
  });

  it('takes the question back when the server refuses before streaming', async () => {
    const { store } = setup();
    await store.open('c1');
    const before = store.messages().length;
    stream.mockRejectedValue(new ApiRequestError(422, 'no_model', 'Wähle zuerst in den Einstellungen ein Modell.'));
    await store.send('Frage');
    expect(store.messages()).toHaveLength(before);
    expect(store.sendError()).toBe('Wähle zuerst in den Einstellungen ein Modell.');
  });

  it('shows a generic error when the connection breaks while streaming', async () => {
    const { store } = setup();
    await store.open('c1');
    stream.mockRejectedValue(new TypeError('network error'));
    await store.send('Frage');
    expect(store.messages().at(-1)).toMatchObject({ error: de.chat.answerFailed, streaming: false });
  });

  it('does nothing without an open chat or while an answer streams', async () => {
    const { store } = setup();
    await store.send('Frage');
    expect(stream).not.toHaveBeenCalled();
    await store.open('c1');
    let finish: () => void = () => undefined;
    stream.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const running = store.send('Erste');
    expect(store.busy()).toBe(true);
    await store.send('Zweite');
    expect(stream).toHaveBeenCalledTimes(1);
    finish();
    await running;
  });

  it('regenerates only the last answer, using its id', async () => {
    const { store } = setup();
    await store.open('c1');
    emit({ event: 'token', data: { text: 'Neu' } }, { event: 'done', data: { message_id: 'm10' } });
    await store.regenerate();
    expect(stream.mock.calls[0][0]).toBe('/chats/c1/messages/m2/regenerate');
    expect(stream.mock.calls[0][1]).toBeUndefined();
    expect(store.messages().map((m) => m.id)).toEqual(['m1', 'm10']);
    expect(store.messages().at(-1)?.content).toBe('Neu');
  });

  it('does not regenerate when the last message is a question', async () => {
    const { store } = setup();
    await store.open('c1');
    store.messages.update((list) => list.slice(0, 1));
    await store.regenerate();
    expect(stream).not.toHaveBeenCalled();
  });

  it('reloads the chat when a regenerate is refused', async () => {
    const { store, api } = setup();
    await store.open('c1');
    stream.mockRejectedValue(new ApiRequestError(409, 'not_last_answer', 'Nur die letzte Antwort kann neu erstellt werden.'));
    await store.regenerate();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(store.messages().map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(store.sendError()).toContain('letzte Antwort');
  });

  it('renames through the chat list and updates the title', async () => {
    const { store, chats } = setup();
    await store.open('c1');
    await store.rename('Mein Titel');
    expect(chats.rename).toHaveBeenCalledWith('c1', 'Mein Titel');
    expect(store.chat()?.title).toBe('Mein Titel');
  });

  it('changes the documents of the chat', async () => {
    const { store, api } = setup();
    await store.open('c1');
    api.patch.mockResolvedValue({ ...detail, documents: [{ id: 'd1', title: 'Doc', status: 'ready' }] });
    await store.setDocuments(['d1']);
    expect(api.patch).toHaveBeenCalledWith('/chats/c1', { document_ids: ['d1'] });
    expect(store.chat()?.documents).toHaveLength(1);
  });
});
