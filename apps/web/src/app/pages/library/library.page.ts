import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient, ApiRequestError, DocumentOut } from '../../core/api';
import { de } from '../../core/i18n/de';
import { ToastService } from '../../core/toast.service';
import { formatBytes, formatDate } from '../../domain/documents';
import { LibraryStore } from '../../state/library.store';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { InputComponent } from '../../ui/atoms/input/input.component';
import { StatusComponent } from '../../ui/atoms/status/status.component';
import { DropZoneComponent } from '../../ui/molecules/drop-zone/drop-zone.component';
import { EmptyStateComponent } from '../../ui/molecules/empty-state/empty-state.component';
import { ImportDialogComponent, PastedText } from '../../ui/organisms/import-dialog/import-dialog.component';

const SELECT =
  'min-h-10 rounded-control border border-border-strong bg-surface px-3 text-sm text-foreground pointer-coarse:min-h-11';

/** Library: upload files, find documents, see their status live. */
@Component({
  selector: 'app-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent, InputComponent, StatusComponent, DropZoneComponent, EmptyStateComponent, ImportDialogComponent],
  template: `
    <app-drop-zone #zone (filesSelected)="store.upload($event)">
      <div class="mx-auto w-full max-w-3xl px-5 py-10">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-3xl font-semibold tracking-tight">{{ t.library.title }}</h1>
          <span class="flex gap-2">
            <app-button (click)="openImport()">{{ t.importDialog.openUrl }}</app-button>
            <app-button variant="primary" (click)="zone.pick()">{{ t.library.upload }}</app-button>
          </span>
        </div>
        <p class="mt-2 text-sm text-muted">{{ t.library.hint }}</p>

        <div class="mt-6 flex flex-wrap gap-2">
          <app-input class="min-w-48 flex-1" [label]="t.library.search" [hideLabel]="true" type="search" [placeholder]="t.library.search" [value]="query()" (valueChange)="onQuery($event)" />
          <select [class]="select" [attr.aria-label]="t.library.allStatus" (change)="onStatus($event)">
            <option value="">{{ t.library.allStatus }}</option>
            @for (s of statuses; track s) { <option [value]="s">{{ t.status[s] }}</option> }
          </select>
          <select [class]="select" [attr.aria-label]="t.library.allKinds" (change)="onKind($event)">
            <option value="">{{ t.library.allKinds }}</option>
            @for (k of kinds; track k) { <option [value]="k">{{ t.kinds[k] }}</option> }
          </select>
          <select [class]="select" [attr.aria-label]="t.library.allOwners" (change)="onScope($event)">
            <option value="all">{{ t.library.allOwners }}</option>
            <option value="mine">{{ t.library.mine }}</option>
            <option value="shared">{{ t.library.sharedWithMe }}</option>
          </select>
        </div>

        @if (store.uploads().length > 0) {
          <ul class="mt-4 space-y-2" aria-live="polite">
            @for (u of store.uploads(); track u.id) {
              <li class="rounded-control border border-border bg-surface px-4 py-3 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <span class="min-w-0 truncate font-medium">{{ u.name }}</span>
                  @if (u.result) { <button type="button" class="cursor-pointer text-muted hover:text-foreground" (click)="store.dismissUpload(u.id)">{{ t.library.dismiss }}</button> }
                </div>
                @if (!u.result) {
                  <progress class="mt-2 h-2 w-full accent-primary" max="1" [value]="u.progress" [attr.aria-label]="t.library.uploading + ': ' + u.name"></progress>
                } @else if (u.result.outcome === 'duplicate' && u.result.document) {
                  <p class="mt-1 text-muted">{{ u.result.message }} · <a class="text-primary underline" [routerLink]="['/library', u.result.document.id]">{{ t.library.duplicateOpen }}</a></p>
                } @else if (u.result.outcome === 'rejected') {
                  <p class="mt-1 text-danger">{{ u.result.message }}</p>
                } @else {
                  <p class="mt-1 text-success">{{ t.library.uploaded }}</p>
                }
              </li>
            }
          </ul>
        }

        <div class="mt-6">
          @if (store.documents().length > 0) {
            <ul class="divide-y divide-border border-y border-border">
              @for (d of visibleDocs(); track d.id) {
                <li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
                  <div class="min-w-0 flex-1">
                    <a class="block truncate font-medium hover:underline" [routerLink]="['/library', d.id]">{{ d.title }}</a>
                    <p class="text-sm text-muted">{{ meta(d) }}</p>
                    @if (d.error) { <p class="text-sm text-danger">{{ d.error }}</p> }
                  </div>
                  <app-status [status]="d.status" />
                  @if (d.status === 'ready') { <a class="text-sm text-primary underline" [routerLink]="['/library', d.id]" fragment="doc-summaries">{{ t.summary.create }}</a> }
                  @if (d.status === 'failed' && d.mine) { <app-button variant="quiet" size="sm" (click)="retry(d)">{{ t.library.retry }}</app-button> }
                </li>
              }
            </ul>
            @if (store.documents().length > shown()) {
              <div class="mt-4 text-center"><app-button (click)="shown.update(n => n + 200)">{{ t.library.more }} ({{ store.documents().length - shown() }})</app-button></div>
            }
          } @else if (!store.loading()) {
            @if (hasFilter()) {
              <p class="py-8 text-center text-muted">{{ t.library.noMatch }}</p>
            } @else {
              <app-empty-state [title]="t.library.empty" [description]="t.library.emptyHint">
                <app-button variant="primary" (click)="zone.pick()">{{ t.library.upload }}</app-button>
              </app-empty-state>
            }
          }
        </div>
      </div>
    </app-drop-zone>

    <app-import-dialog
      #importer
      [(open)]="importOpen"
      [(mode)]="importMode"
      [busy]="importBusy()"
      [error]="importError()"
      [offerText]="offerText()"
      (importUrl)="importUrl($event, importer)"
      (importText)="importText($event)"
    />
  `,
})
export class LibraryPage implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private timer: ReturnType<typeof setTimeout> | undefined;
  protected readonly store = inject(LibraryStore);
  protected readonly t = de;
  protected readonly select = SELECT;
  protected readonly statuses = ['queued', 'reading', 'indexing', 'ready', 'failed'] as const;
  protected readonly kinds = ['pdf', 'docx', 'pptx', 'html', 'epub', 'md', 'txt', 'url', 'text'] as const;
  protected readonly shown = signal(200);
  protected readonly visibleDocs = computed(() => this.store.documents().slice(0, this.shown()));
  protected readonly query = signal('');
  protected readonly importOpen = signal(false);
  protected readonly importMode = signal<'url' | 'text'>('url');
  protected readonly importBusy = signal(false);
  protected readonly importError = signal('');
  protected readonly offerText = signal(false);

  constructor() {
    void this.store.load();
    this.store.connect();
  }

  /** Stop the live status stream. */
  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.store.disconnect();
  }

  /** Open the import dialog with a clean state. */
  protected openImport(): void {
    this.importMode.set('url');
    this.importError.set('');
    this.offerText.set(false);
    this.importOpen.set(true);
  }

  /**
   * Import a web page; if it cannot be read, show why and offer to paste the text.
   * @param url - The address.
   * @param dialog - The dialog, to suggest a title for pasted text.
   */
  protected async importUrl(url: string, dialog: ImportDialogComponent): Promise<void> {
    this.importBusy.set(true);
    this.importError.set('');
    try {
      const result = await this.store.importUrl(url);
      this.importOpen.set(false);
      this.toast.show(result.outcome === 'duplicate' ? de.importDialog.duplicate : de.importDialog.added);
    } catch (e) {
      const known = e instanceof ApiRequestError;
      this.importError.set(known ? e.message : de.errors.unknown);
      this.offerText.set(known && e.code.startsWith('url_') && e.code !== 'url_invalid');
      try {
        dialog.suggestTitle(new URL(url).hostname);
      } catch {
        // INFO: Not a valid address; the person types the title themselves.
      }
    } finally {
      this.importBusy.set(false);
    }
  }

  /**
   * Store pasted text as a document.
   * @param pasted - Title and text.
   */
  protected async importText(pasted: PastedText): Promise<void> {
    this.importBusy.set(true);
    this.importError.set('');
    try {
      const result = await this.store.importText(pasted.title, pasted.text);
      this.importOpen.set(false);
      this.toast.show(result.outcome === 'duplicate' ? de.importDialog.duplicate : de.importDialog.added);
    } catch (e) {
      this.importError.set(e instanceof ApiRequestError ? e.message : de.errors.unknown);
    } finally {
      this.importBusy.set(false);
    }
  }

  /**
   * Whether any filter is active.
   * @returns True if the list is filtered.
   */
  protected hasFilter(): boolean {
    const f = this.store.filters();
    return !!(f.q || f.status || f.kind || f.scope !== 'all');
  }

  /**
   * Search after a short pause in typing.
   * @param value - The search text.
   */
  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.store.setFilters({ q: value.trim() }), 250);
  }

  /**
   * Filter by status.
   * @param event - The select change event.
   */
  protected onStatus(event: Event): void {
    void this.store.setFilters({ status: (event.target as HTMLSelectElement).value });
  }

  /**
   * Filter by document type.
   * @param event - The select change event.
   */
  protected onKind(event: Event): void {
    void this.store.setFilters({ kind: (event.target as HTMLSelectElement).value });
  }

  /**
   * Filter by owner.
   * @param event - The select change event.
   */
  protected onScope(event: Event): void {
    void this.store.setFilters({ scope: (event.target as HTMLSelectElement).value as 'all' | 'mine' | 'shared' });
  }

  /**
   * One grey line under the title: type, size, pages, date, sharing.
   * @param d - The document.
   * @returns The text.
   */
  protected meta(d: DocumentOut): string {
    const kind = (de.kinds as Record<string, string>)[d.kind] ?? d.kind;
    const unit = d.kind === 'pptx' ? de.library.slides : de.library.pages;
    const parts = [kind, formatBytes(d.size_bytes), d.page_count ? `${d.page_count} ${unit}` : '', formatDate(d.created_at)];
    if (!d.mine) parts.push(`${de.library.sharedBy} ${d.owner_name}`);
    else if (d.shared) parts.push(de.library.shared);
    return parts.filter(Boolean).join(' · ');
  }

  /**
   * Process a failed document again.
   * @param d - The document.
   */
  protected async retry(d: DocumentOut): Promise<void> {
    try {
      this.store.upsert(await this.api.post<DocumentOut>(`/documents/${d.id}/retry`));
    } catch (e) {
      this.toast.show(e instanceof ApiRequestError ? e.message : de.errors.unknown, 'danger');
    }
  }
}
