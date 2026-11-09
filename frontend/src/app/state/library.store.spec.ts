import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../../testing/create';
import { ApiClient, ApiRequestError, DocumentOut } from '../core/api';
import { UploadResult, uploadFile } from '../core/upload';
import { LibraryStore } from './library.store';

vi.mock('../core/upload', () => ({ uploadFile: vi.fn() }));

const upload = vi.mocked(uploadFile);

const doc = (id: string, title = id): DocumentOut => ({ id, title }) as DocumentOut;

function setup(): { store: LibraryStore; api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; onUnauthorized: (() => void) | null } } {
  const api = { get: vi.fn().mockResolvedValue([]), post: vi.fn(), onUnauthorized: null };
  return { store: create(LibraryStore, [{ provide: ApiClient, useValue: api }]), api };
}

/** A stand-in for EventSource that records what the store does with it. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  handlers = new Map<string, (event: MessageEvent<string>) => void>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, handler: (event: MessageEvent<string>) => void): void {
    this.handlers.set(name, handler);
  }
  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  upload.mockReset();
});

describe('LibraryStore', () => {
  it('builds the query from the filters', async () => {
    const { store, api } = setup();
    await store.load();
    expect(api.get).toHaveBeenLastCalledWith('/documents');
    await store.setFilters({ q: 'miet vertrag', status: 'ready', kind: 'pdf', scope: 'mine' });
    expect(api.get).toHaveBeenLastCalledWith('/documents?q=miet+vertrag&status=ready&kind=pdf&scope=mine');
  });

  it('keeps the list and shows the message when loading fails', async () => {
    const { store, api } = setup();
    api.get.mockRejectedValue(new ApiRequestError(0, 'network', 'Der Server ist nicht erreichbar.'));
    await store.load();
    expect(store.error()).toBe('Der Server ist nicht erreichbar.');
    expect(store.loading()).toBe(false);
  });

  it('upsert replaces a known document, adds new ones only when nothing is filtered', () => {
    const { store } = setup();
    store.documents.set([doc('a', 'Alt')]);
    store.upsert(doc('a', 'Neu'));
    expect(store.documents()[0].title).toBe('Neu');
    store.upsert(doc('b'));
    expect(store.documents().map((d) => d.id)).toEqual(['b', 'a']);
    store.filters.update((f) => ({ ...f, status: 'ready' }));
    store.upsert(doc('c'));
    expect(store.documents().map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('removes a document', () => {
    const { store } = setup();
    store.documents.set([doc('a'), doc('b')]);
    store.remove('a');
    expect(store.documents().map((d) => d.id)).toEqual(['b']);
  });

  it('opens one event stream for several listeners and closes it with the last one', () => {
    const { store } = setup();
    store.connect();
    store.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/documents/events');
    store.disconnect();
    expect(FakeEventSource.instances[0].closed).toBe(false);
    store.disconnect();
    expect(FakeEventSource.instances[0].closed).toBe(true);
    store.disconnect();
    store.connect();
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('applies document events from the stream', () => {
    const { store } = setup();
    store.documents.set([{ id: 'a', status: 'extracting' } as DocumentOut]);
    store.connect();
    const handler = FakeEventSource.instances[0].handlers.get('document');
    handler?.({ data: JSON.stringify({ id: 'a', status: 'ready' }) } as MessageEvent<string>);
    expect(store.documents()[0].status).toBe('ready');
  });

  it('uploads files one after another with their own entries', async () => {
    const { store } = setup();
    const created: UploadResult = { filename: 'a.txt', outcome: 'created', document: doc('a') };
    const rejected: UploadResult = { filename: 'b.exe', outcome: 'rejected', message: 'Dieser Dateityp wird nicht unterstützt.' };
    upload.mockResolvedValueOnce(created).mockResolvedValueOnce(rejected);
    await store.upload([new File(['x'], 'a.txt'), new File(['y'], 'b.exe')]);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(store.uploads().map((u) => u.name)).toEqual(['a.txt', 'b.exe']);
    expect(store.uploads()[1].result?.outcome).toBe('rejected');
    expect(store.documents().map((d) => d.id)).toEqual(['a']);
  });

  it('hides a created upload after a few seconds but keeps failures', async () => {
    const { store } = setup();
    upload.mockResolvedValueOnce({ filename: 'a.txt', outcome: 'created', document: doc('a') });
    upload.mockResolvedValueOnce({ filename: 'b.exe', outcome: 'rejected', message: 'nein' });
    await store.upload([new File(['x'], 'a.txt'), new File(['y'], 'b.exe')]);
    vi.advanceTimersByTime(6001);
    expect(store.uploads().map((u) => u.name)).toEqual(['b.exe']);
    store.dismissUpload(store.uploads()[0].id);
    expect(store.uploads()).toEqual([]);
  });

  it('imports a page and pasted text into the list', async () => {
    const { store, api } = setup();
    api.post.mockResolvedValueOnce({ filename: 'u', outcome: 'created', document: doc('u') });
    api.post.mockResolvedValueOnce({ filename: 't', outcome: 'created', document: doc('t') });
    await store.importUrl('https://example.com/a');
    await store.importText('Notiz', 'Text');
    expect(api.post).toHaveBeenNthCalledWith(1, '/documents/url', { url: 'https://example.com/a' });
    expect(api.post).toHaveBeenNthCalledWith(2, '/documents/text', { title: 'Notiz', text: 'Text' });
    expect(store.documents().map((d) => d.id)).toEqual(['t', 'u']);
  });
});
