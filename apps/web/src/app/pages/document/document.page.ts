import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiClient, ApiRequestError, DocumentOut, DocumentPatch, DocumentTextOut } from '../../core/api';
import { de } from '../../core/i18n/de';
import { ToastService } from '../../core/toast.service';
import { PageSection, TextBlock, formatBytes, formatDate, splitPages, toBlocks } from '../../domain/documents';
import { LibraryStore } from '../../state/library.store';
import { BadgeComponent } from '../../ui/atoms/badge/badge.component';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { InputComponent } from '../../ui/atoms/input/input.component';
import { StatusComponent } from '../../ui/atoms/status/status.component';
import { EmptyStateComponent } from '../../ui/molecules/empty-state/empty-state.component';
import { SummarySection } from './summary-section';
import { DialogComponent } from '../../ui/organisms/dialog/dialog.component';

/** One document: details, rename, share, download, delete, retry and the extracted text. */
@Component({
  selector: 'app-document-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent, InputComponent, BadgeComponent, StatusComponent, EmptyStateComponent, DialogComponent, SummarySection],
  template: `
    <div class="mx-auto w-full max-w-3xl px-5 py-10">
      <a routerLink="/library" class="text-sm text-muted hover:text-foreground">← {{ t.document.back }}</a>

      @if (doc(); as d) {
        <div class="mt-4 flex flex-wrap items-start justify-between gap-3">
          @if (editing()) {
            <form class="flex min-w-0 flex-1 items-end gap-2" (submit)="saveTitle($event)">
              <app-input class="min-w-0 flex-1" [label]="t.document.titleLabel" [(value)]="titleDraft" [autofocus]="true" />
              <app-button type="submit" variant="primary">{{ t.common.save }}</app-button>
              <app-button (click)="editing.set(false)">{{ t.common.cancel }}</app-button>
            </form>
          } @else {
            <h1 class="min-w-0 flex-1 text-3xl font-semibold tracking-tight break-words">{{ d.title }}</h1>
            @if (d.mine) { <app-button size="sm" (click)="startEdit(d)">{{ t.document.rename }}</app-button> }
          }
        </div>

        @if (d.url) { <a class="mt-1 block truncate text-sm text-primary underline" [href]="d.url" target="_blank" rel="noopener noreferrer">{{ d.url }}</a> }
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <app-status [status]="d.status" />
          @if (d.shared) { <app-badge>{{ d.mine ? t.library.shared : t.library.sharedBy + ' ' + d.owner_name }}</app-badge> }
        </div>
        @if (d.error) { <p class="mt-2 text-danger">{{ d.error }}</p> }

        <dl class="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-border bg-surface p-5 text-sm sm:grid-cols-3">
          <div><dt class="text-muted">{{ t.document.type }}</dt><dd class="font-medium">{{ kindLabel(d) }}</dd></div>
          <div><dt class="text-muted">{{ t.document.size }}</dt><dd class="font-medium">{{ size(d) || '–' }}</dd></div>
          <div><dt class="text-muted">{{ d.kind === 'pptx' ? t.library.slides : t.library.pages }}</dt><dd class="font-medium">{{ d.page_count ?? '–' }}</dd></div>
          <div><dt class="text-muted">{{ t.library.words }}</dt><dd class="font-medium">{{ d.word_count ?? '–' }}</dd></div>
          <div><dt class="text-muted">{{ t.document.language }}</dt><dd class="font-medium">{{ language(d) }}</dd></div>
          <div><dt class="text-muted">{{ t.document.added }}</dt><dd class="font-medium">{{ added(d) }}</dd></div>
          @if (!d.mine) { <div><dt class="text-muted">{{ t.document.owner }}</dt><dd class="font-medium">{{ d.owner_name }}</dd></div> }
        </dl>

        <div class="mt-6 flex flex-wrap gap-2">
          @if (d.status === 'ready') { <a class="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-medium text-on-primary hover:opacity-90 pointer-coarse:min-h-11" routerLink="/" [queryParams]="{ doc: d.id }">{{ t.document.startChat }}</a> }
          @if (d.filename) { <a class="inline-flex min-h-10 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-muted pointer-coarse:min-h-11" [href]="'/api/documents/' + d.id + '/file'" [download]="d.filename">{{ t.document.download }}</a> }
          @if (d.mine) {
            <app-button (click)="reprocess(d)">{{ t.document.reprocess }}</app-button>
            <app-button variant="danger" (click)="deleteOpen.set(true)">{{ t.document.delete }}</app-button>
          }
        </div>

        @if (d.mine) {
          <label class="mt-6 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" class="mt-0.5 size-4 accent-primary" [checked]="d.shared" (change)="toggleShare(d)" />
            <span><span class="font-medium">{{ t.document.share }}</span><span class="block text-muted">{{ t.document.shareHint }}</span></span>
          </label>
        }

        <app-summary-section [documentId]="d.id" [ready]="d.status === 'ready'" />

        <section class="mt-10" aria-labelledby="doc-text">
          <h2 id="doc-text" class="mb-3 text-xl font-semibold">{{ t.document.text }}</h2>
          @if (sections().length > 0) {
            <div class="space-y-6 rounded-card border border-border bg-surface p-5">
              @for (s of visible(); track $index) {
                <div>
                  @if (s.page !== null) { <h3 class="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{{ t.document.page }} {{ s.page }}</h3> }
                  @for (b of blocks(s.text); track $index) {
                    @if (b.level > 0) { <p class="mt-3 font-serif text-lg font-semibold first:mt-0">{{ b.text }}</p> }
                    @else { <p class="mt-2 font-serif leading-relaxed whitespace-pre-wrap first:mt-0">{{ b.text }}</p> }
                  }
                </div>
              }
            </div>
            @if (visible().length < sections().length) {
              <div class="mt-4 text-center"><app-button (click)="showMore()">+ {{ sections().length - visible().length }}</app-button></div>
            }
          } @else {
            <p class="text-sm text-muted">{{ t.document.textNotReady }}</p>
          }
        </section>
      } @else if (missing()) {
        <div class="mt-8"><app-empty-state [title]="t.document.notFound" /></div>
      }
    </div>

    <app-dialog [(open)]="deleteOpen" [title]="t.document.deleteTitle" [description]="t.document.deleteText">
      <ng-container dialog-actions>
        <app-button (click)="deleteOpen.set(false)">{{ t.common.cancel }}</app-button>
        <app-button variant="danger" (click)="remove()">{{ t.document.delete }}</app-button>
      </ng-container>
    </app-dialog>
  `,
})
export class DocumentPage implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly store = inject(LibraryStore);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private loadedFor = '';
  protected readonly t = de;

  protected readonly doc = signal<DocumentOut | null>(null);
  protected readonly missing = signal(false);
  protected readonly text = signal<DocumentTextOut | null>(null);
  protected readonly editing = signal(false);
  protected readonly titleDraft = signal('');
  protected readonly deleteOpen = signal(false);
  protected readonly shown = signal(20);
  protected readonly sections = computed<PageSection[]>(() => splitPages(this.text()?.markdown ?? ''));
  protected readonly visible = computed(() => this.sections().slice(0, this.shown()));

  constructor() {
    this.store.connect();
    void this.load();
    // Live updates: when the library stream reports this document, take the new state.
    effect(() => {
      const fresh = this.store.documents().find((d) => d.id === this.id);
      if (fresh) this.doc.set(fresh);
    });
    // Load the text once the document is ready (and again after it was processed again).
    effect(() => {
      const d = this.doc();
      if (d?.status === 'ready' && this.loadedFor !== d.updated_at) {
        this.loadedFor = d.updated_at;
        void this.loadText();
      }
    });
  }

  /** Stop the live status stream. */
  ngOnDestroy(): void {
    this.store.disconnect();
  }

  /** Load the document. */
  private async load(): Promise<void> {
    try {
      this.doc.set(await this.api.get<DocumentOut>(`/documents/${this.id}`));
    } catch {
      this.missing.set(true);
    }
  }

  /** Load the extracted text. */
  private async loadText(): Promise<void> {
    try {
      this.text.set(await this.api.get<DocumentTextOut>(`/documents/${this.id}/text`));
      this.shown.set(20);
    } catch {
      this.text.set(null);
    }
  }

  /**
   * Show an error as a toast.
   * @param e - The caught error.
   */
  private fail(e: unknown): void {
    this.toast.show(e instanceof ApiRequestError ? e.message : de.errors.unknown, 'danger');
  }

  /**
   * Type label of a document.
   * @param d - The document.
   * @returns For example `PDF`.
   */
  protected kindLabel(d: DocumentOut): string {
    return (de.kinds as Record<string, string>)[d.kind] ?? d.kind;
  }

  /**
   * File size for display.
   * @param d - The document.
   * @returns For example `2,4 MB`.
   */
  protected size(d: DocumentOut): string {
    return formatBytes(d.size_bytes);
  }

  /**
   * Language for display.
   * @param d - The document.
   * @returns For example `Deutsch`.
   */
  protected language(d: DocumentOut): string {
    const labels = de.document.languages as Record<string, string>;
    return labels[d.language ?? 'unknown'] ?? labels['unknown'];
  }

  /**
   * Date added for display.
   * @param d - The document.
   * @returns `Heute`, `Gestern` or a date.
   */
  protected added(d: DocumentOut): string {
    return formatDate(d.created_at);
  }

  /**
   * Headings and paragraphs of one text section.
   * @param text - The section text.
   * @returns The blocks.
   */
  protected blocks(text: string): TextBlock[] {
    return toBlocks(text);
  }

  /** Show 40 more sections of the text. */
  protected showMore(): void {
    this.shown.update((n) => n + 40);
  }

  /**
   * Start renaming.
   * @param d - The document.
   */
  protected startEdit(d: DocumentOut): void {
    this.titleDraft.set(d.title);
    this.editing.set(true);
  }

  /**
   * Save the new title.
   * @param event - The form submit event.
   */
  protected async saveTitle(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.titleDraft().trim();
    if (!title) return;
    await this.patch({ title });
    this.editing.set(false);
  }

  /**
   * Switch sharing with the household on or off.
   * @param d - The document.
   * @returns A promise that resolves when the change is saved.
   */
  protected toggleShare(d: DocumentOut): Promise<void> {
    return this.patch({ shared: !d.shared });
  }

  /**
   * Send a change to the API and take the result.
   * @param body - Fields to change.
   */
  private async patch(body: DocumentPatch): Promise<void> {
    try {
      const updated = await this.api.patch<DocumentOut>(`/documents/${this.id}`, body);
      this.doc.set(updated);
      this.store.upsert(updated);
      this.toast.show(de.document.saved);
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Process the document again.
   * @param d - The document.
   */
  protected async reprocess(d: DocumentOut): Promise<void> {
    try {
      const updated = await this.api.post<DocumentOut>(`/documents/${d.id}/retry`);
      this.doc.set(updated);
      this.store.upsert(updated);
      this.toast.show(de.document.queuedAgain);
    } catch (e) {
      this.fail(e);
    }
  }

  /** Delete the document and go back to the library. */
  protected async remove(): Promise<void> {
    try {
      await this.api.delete(`/documents/${this.id}`);
      this.deleteOpen.set(false);
      this.store.remove(this.id);
      this.toast.show(de.document.deleted);
      await this.router.navigate(['/library']);
    } catch (e) {
      this.fail(e);
    }
  }
}
