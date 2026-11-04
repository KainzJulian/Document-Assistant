import { Injectable, inject, signal } from '@angular/core';
import { ApiClient, ApiRequestError, DocumentOut } from '../core/api';
import { UploadResult, uploadFile } from '../core/upload';

/** Filters of the library list. */
export interface LibraryFilters {
  q: string;
  status: string;
  kind: string;
  scope: 'all' | 'mine' | 'shared';
}

/** One file that is being uploaded or was just uploaded. */
export interface UploadEntry {
  id: number;
  name: string;
  /** 0 to 1 while sending. */
  progress: number;
  /** Set when the server answered. */
  result: UploadResult | null;
}

/**
 * The person's library: the document list, filters, uploads and live status updates.
 *
 * Statuses change on the server (reading, ready ...); an event stream keeps the list current
 * without reloading.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly api = inject(ApiClient);
  private source: EventSource | null = null;
  private listeners = 0;
  private nextUploadId = 0;

  /** Documents matching the filters, newest first. */
  readonly documents = signal<DocumentOut[]>([]);
  /** True while the list is loading. */
  readonly loading = signal(false);
  /** Current filters. */
  readonly filters = signal<LibraryFilters>({ q: '', status: '', kind: '', scope: 'all' });
  /** Uploads in progress or just finished. */
  readonly uploads = signal<UploadEntry[]>([]);
  /** Error text of the last failed load. */
  readonly error = signal('');

  /**
   * Change filters and reload.
   * @param patch - The filter fields to change.
   */
  async setFilters(patch: Partial<LibraryFilters>): Promise<void> {
    this.filters.update((f) => ({ ...f, ...patch }));
    await this.load();
  }

  /** Load the list with the current filters. */
  async load(): Promise<void> {
    const f = this.filters();
    const params = new URLSearchParams();
    if (f.q) params.set('q', f.q);
    if (f.status) params.set('status', f.status);
    if (f.kind) params.set('kind', f.kind);
    if (f.scope !== 'all') params.set('scope', f.scope);
    this.loading.set(true);
    this.error.set('');
    try {
      const query = params.toString();
      this.documents.set(await this.api.get<DocumentOut[]>(`/documents${query ? `?${query}` : ''}`));
    } catch (e) {
      this.error.set(e instanceof ApiRequestError ? e.message : '');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Replace a document in the list (after rename, share or an event).
   * @param doc - The new state of the document.
   */
  upsert(doc: DocumentOut): void {
    this.documents.update((list) => {
      const index = list.findIndex((d) => d.id === doc.id);
      if (index >= 0) return list.map((d) => (d.id === doc.id ? doc : d));
      const f = this.filters();
      const unfiltered = !f.q && !f.status && !f.kind && f.scope !== 'shared';
      return unfiltered ? [doc, ...list] : list;
    });
  }

  /**
   * Remove a document from the list.
   * @param id - Id of the document.
   */
  remove(id: string): void {
    this.documents.update((list) => list.filter((d) => d.id !== id));
  }

  /** Start listening for status changes; every `connect()` needs a matching `disconnect()`. */
  connect(): void {
    this.listeners++;
    if (this.source) return;
    this.source = new EventSource('/api/documents/events');
    this.source.addEventListener('document', (event) => {
      this.upsert(JSON.parse((event as MessageEvent<string>).data) as DocumentOut);
    });
  }

  /** Stop listening once nobody needs the stream any more. */
  disconnect(): void {
    this.listeners = Math.max(0, this.listeners - 1);
    if (this.listeners > 0) return;
    this.source?.close();
    this.source = null;
  }

  /**
   * Upload files one after another; each gets its own progress entry and result.
   * @param files - The files chosen or dropped.
   */
  async upload(files: File[]): Promise<void> {
    const entries = files.map((file) => ({ id: this.nextUploadId++, name: file.name, progress: 0, result: null as UploadResult | null }));
    this.uploads.update((list) => [...entries, ...list]);
    for (const [index, file] of files.entries()) {
      const entry = entries[index];
      const result = await uploadFile(file, (progress) => this.patchUpload(entry.id, { progress }));
      this.patchUpload(entry.id, { progress: 1, result });
      if (result.document) this.upsert(result.document);
      if (result.outcome === 'created') setTimeout(() => this.dismissUpload(entry.id), 6000);
    }
  }

  /**
   * Import a web page.
   * @param url - The address.
   * @returns The API's result (created or duplicate).
   * @throws {ApiRequestError} With a `url_*` code and a German message if the page cannot be used.
   */
  async importUrl(url: string): Promise<UploadResult> {
    const result = await this.api.post<UploadResult>('/documents/url', { url });
    if (result.document) this.upsert(result.document);
    return result;
  }

  /**
   * Store pasted text as a document.
   * @param title - Title of the document.
   * @param text - The text.
   * @returns The API's result (created or duplicate).
   */
  async importText(title: string, text: string): Promise<UploadResult> {
    const result = await this.api.post<UploadResult>('/documents/text', { title, text });
    if (result.document) this.upsert(result.document);
    return result;
  }

  /**
   * Hide a finished upload entry.
   * @param id - Id of the entry.
   */
  dismissUpload(id: number): void {
    this.uploads.update((list) => list.filter((u) => u.id !== id));
  }

  /**
   * Change fields of an upload entry.
   * @param id - Id of the entry.
   * @param patch - Fields to change.
   */
  private patchUpload(id: number, patch: Partial<UploadEntry>): void {
    this.uploads.update((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }
}
