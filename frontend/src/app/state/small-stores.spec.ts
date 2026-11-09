import { describe, expect, it, vi } from 'vitest';
import { Router } from '@angular/router';
import { create } from '../../testing/create';
import { ApiClient, ApiRequestError, ChatSummary, SettingsOut, User } from '../core/api';
import { ChatsStore } from './chats.store';
import { DraftStore } from './drafts.store';
import { SessionStore } from './session.store';
import { SettingsStore } from './settings.store';

interface FakeApi {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  onUnauthorized: (() => void) | null;
}

function fakeApi(): FakeApi {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), request: vi.fn(), onUnauthorized: null };
}

const provide = (api: FakeApi): { provide: typeof ApiClient; useValue: FakeApi } => ({ provide: ApiClient, useValue: api });

function chat(id: string, title: string | null = null, updated = '2026-11-05T10:00:00Z'): ChatSummary {
  return { id, title, created_at: '2026-11-05T09:00:00Z', updated_at: updated, snippet: null, message_id: null };
}

describe('DraftStore', () => {
  it('remembers an unsent question per chat and clears it with an empty text', () => {
    const drafts = create(DraftStore, []);
    expect(drafts.chatDraft('a')).toBe('');
    drafts.setChatDraft('a', 'Noch offen');
    drafts.setChatDraft('b', 'Anderes');
    expect(drafts.chatDraft('a')).toBe('Noch offen');
    drafts.setChatDraft('a', '');
    expect(drafts.chatDraft('a')).toBe('');
    expect(drafts.chatDraft('b')).toBe('Anderes');
  });

  it('keeps the new-chat text and selection', () => {
    const drafts = create(DraftStore, []);
    drafts.newChatText.set('Frage');
    drafts.newChatSelected.set(['d1', 'd2']);
    expect(drafts.newChatText()).toBe('Frage');
    expect(drafts.newChatSelected()).toEqual(['d1', 'd2']);
  });
});

describe('ChatsStore', () => {
  it('loads the chats', async () => {
    const api = fakeApi();
    api.get.mockResolvedValue([chat('a')]);
    const store = create(ChatsStore, [provide(api)]);
    await store.load();
    expect(api.get).toHaveBeenCalledWith('/chats');
    expect(store.chats().map((c) => c.id)).toEqual(['a']);
  });

  it('searches with an encoded query and clears the results for an empty text', async () => {
    const api = fakeApi();
    api.get.mockResolvedValue([chat('a', 'Zusammenfassung')]);
    const store = create(ChatsStore, [provide(api)]);
    await store.search('  Zusamen fassung ');
    expect(api.get).toHaveBeenCalledWith('/chats?q=Zusamen%20fassung');
    expect(store.results()).toHaveLength(1);
    await store.search('   ');
    expect(store.results()).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('ignores a slow answer for an older search text', async () => {
    const api = fakeApi();
    let release: (value: ChatSummary[]) => void = () => undefined;
    api.get.mockImplementationOnce(() => new Promise<ChatSummary[]>((resolve) => (release = resolve)));
    api.get.mockResolvedValueOnce([chat('new')]);
    const store = create(ChatsStore, [provide(api)]);
    const first = store.search('alt');
    await store.search('neu');
    release([chat('old')]);
    await first;
    expect(store.results()?.map((c) => c.id)).toEqual(['new']);
  });

  it('upsert moves a chat to the top and keeps its other fields', () => {
    const store = create(ChatsStore, [provide(fakeApi())]);
    store.chats.set([chat('a', 'A'), chat('b', 'B')]);
    store.upsert({ id: 'b', title: 'B neu', created_at: '2026-11-05T09:00:00Z', updated_at: '2026-11-05T12:00:00Z' });
    expect(store.chats().map((c) => c.id)).toEqual(['b', 'a']);
    expect(store.chats()[0].title).toBe('B neu');
    store.upsert({ id: 'c', title: null, created_at: 'x', updated_at: 'y' });
    expect(store.chats().map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });

  it('renames and removes chats, also in the search results', async () => {
    const api = fakeApi();
    api.patch.mockResolvedValue(chat('a', 'Neuer Titel'));
    const store = create(ChatsStore, [provide(api)]);
    store.chats.set([chat('a', 'Alt'), chat('b', 'B')]);
    store.results.set([chat('a', 'Alt')]);
    await store.rename('a', 'Neuer Titel');
    expect(api.patch).toHaveBeenCalledWith('/chats/a', { title: 'Neuer Titel' });
    expect(store.chats()[0].title).toBe('Neuer Titel');
    await store.remove('a');
    expect(api.delete).toHaveBeenCalledWith('/chats/a');
    expect(store.chats().map((c) => c.id)).toEqual(['b']);
    expect(store.results()).toEqual([]);
  });
});

describe('SettingsStore', () => {
  const settings: SettingsOut = { provider_id: 1, model: 'fake-chat', summary_language: 'source', providers: [] };

  it('loads the settings', async () => {
    const api = fakeApi();
    api.get.mockResolvedValue(settings);
    const store = create(SettingsStore, [provide(api)]);
    await store.load();
    expect(store.settings()).toEqual(settings);
  });

  it('saves with PUT and takes the answer', async () => {
    const api = fakeApi();
    api.request.mockResolvedValue({ ...settings, summary_language: 'de' });
    const store = create(SettingsStore, [provide(api)]);
    await store.save(1, 'fake-chat', 'de');
    expect(api.request).toHaveBeenCalledWith('PUT', '/settings', { provider_id: 1, model: 'fake-chat', summary_language: 'de' });
    expect(store.settings()?.summary_language).toBe('de');
  });
});

describe('SessionStore', () => {
  const user = { id: 'u1', username: 'anna', role: 'member' } as User;

  function setup(api: FakeApi): { store: SessionStore; navigate: ReturnType<typeof vi.fn> } {
    const navigate = vi.fn().mockResolvedValue(true);
    const store = create(SessionStore, [provide(api), { provide: Router, useValue: { navigate } }]);
    return { store, navigate };
  }

  it('checks the session once, even when asked twice at the same time', async () => {
    const api = fakeApi();
    api.get.mockResolvedValue(user);
    const { store } = setup(api);
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    await store.ensureLoaded();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(store.user()).toEqual(user);
    expect(store.loaded()).toBe(true);
  });

  it('treats a 401 as "not logged in" but passes other errors on', async () => {
    const api = fakeApi();
    api.get.mockRejectedValueOnce(new ApiRequestError(401, 'not_authenticated', 'x'));
    const { store } = setup(api);
    await store.ensureLoaded();
    expect(store.user()).toBeNull();
    expect(store.loaded()).toBe(true);

    const broken = fakeApi();
    broken.get.mockRejectedValueOnce(new ApiRequestError(0, 'network', 'offline'));
    await expect(setup(broken).store.ensureLoaded()).rejects.toMatchObject({ code: 'network' });
  });

  it('logs in and out', async () => {
    const api = fakeApi();
    api.post.mockResolvedValue(user);
    const { store, navigate } = setup(api);
    await store.login({ username: 'anna', password: 'x' });
    expect(store.user()).toEqual(user);
    await store.logout();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(store.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('still leaves when the logout call fails', async () => {
    const api = fakeApi();
    api.post.mockRejectedValue(new ApiRequestError(0, 'network', 'offline'));
    const { store, navigate } = setup(api);
    store.user.set(user);
    await expect(store.logout()).rejects.toBeInstanceOf(ApiRequestError);
    expect(store.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('sends the person to the login page when the API reports an expired session', () => {
    const api = fakeApi();
    const { store, navigate } = setup(api);
    store.user.set(user);
    api.onUnauthorized?.();
    expect(store.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
