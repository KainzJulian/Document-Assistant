import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient, ApiRequestError } from '../../core/api';
import { de } from '../../core/i18n/de';
import { streamPost } from '../../core/sse';
import { ToastService } from '../../core/toast.service';
import { formatDate } from '../../domain/documents';
import { SettingsStore } from '../../state/settings.store';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { LengthSelectComponent } from '../../ui/molecules/length-select/length-select.component';

/** A saved summary as the API returns it. */
interface Summary {
  id: string;
  length: string;
  text: string;
  word_count: number;
  target_words: number;
  nominal_words: number;
  note: string | null;
  provider: string;
  model: string;
  created_at: string;
}

/** Summaries of one document: choose a length, create it (streamed), reopen saved ones. */
@Component({
  selector: 'app-summary-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent, LengthSelectComponent],
  template: `
    <section class="mt-10" aria-labelledby="doc-summaries">
      <h2 id="doc-summaries" class="mb-3 text-xl font-semibold">{{ t.title }}</h2>
      @if (!ready()) {
        <p class="text-sm text-muted">{{ t.notReady }}</p>
      } @else {
        <app-length-select [(value)]="length" [disabled]="busy()" />
        <label class="mt-3 flex min-h-10 cursor-pointer items-center gap-3 text-sm pointer-coarse:min-h-11">
          <input type="checkbox" class="size-4 accent-primary" [checked]="german()" [disabled]="busy()" (change)="german.set(!german())" />
          {{ t.toGerman }}
        </label>

        <div class="mt-4 rounded-card border border-border bg-surface p-5" aria-live="off">
          @if (busy()) {
            <p class="text-sm text-muted">{{ progress() || t.working }}</p>
            @if (streamed()) { <p class="mt-2 leading-relaxed whitespace-pre-wrap">{{ streamed() }}</p> }
          } @else if (current(); as s) {
            <p class="leading-relaxed whitespace-pre-wrap">{{ s.text }}</p>
            <p class="mt-3 text-xs text-muted">{{ s.word_count }} {{ words }} · {{ by(s) }}</p>
            @if (s.note) { <p class="mt-1 text-xs text-muted">{{ s.note }}</p> }
          } @else {
            <p class="text-sm text-muted">{{ t.none }}</p>
          }
          @if (error()) { <p role="alert" class="mt-2 text-sm text-danger">{{ error() }}</p> }
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <app-button variant="primary" [loading]="busy()" (click)="create()">{{ current() ? t.recreate : t.create }}</app-button>
          @if (current(); as s) {
            <app-button (click)="copy(s.text)">{{ t.copy }}</app-button>
            <a routerLink="/" [queryParams]="{ doc: documentId() }" class="inline-flex min-h-10 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-muted pointer-coarse:min-h-11">{{ t.continueChat }}</a>
          }
        </div>
      }
    </section>
  `,
})
export class SummarySection {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly settings = inject(SettingsStore);
  protected readonly t = de.summary;
  protected readonly words = de.library.words;

  /** Id of the document. */
  readonly documentId = input.required<string>();
  /** Whether the document is ready (summaries need its text). */
  readonly ready = input(false);

  protected readonly summaries = signal<Summary[]>([]);
  protected readonly length = signal<'xs' | 's' | 'm' | 'l' | 'xl'>('m');
  protected readonly german = signal(false);
  protected readonly busy = signal(false);
  protected readonly progress = signal('');
  protected readonly streamed = signal('');
  protected readonly error = signal('');
  protected readonly current = computed(() => this.summaries().find((s) => s.length === this.length()) ?? null);

  constructor() {
    queueMicrotask(() => void this.init());
  }

  /** Load the saved summaries and the default language from the settings. */
  private async init(): Promise<void> {
    try {
      this.summaries.set(await this.api.get<Summary[]>(`/documents/${this.documentId()}/summaries`));
      await this.settings.load();
      this.german.set(this.settings.settings()?.summary_language === 'de');
    } catch {
      // INFO: The list stays empty; creating a summary shows its own errors.
    }
  }

  /**
   * "Erstellt mit {model} am {date}".
   * @param s - The summary.
   * @returns The text.
   */
  protected by(s: Summary): string {
    return this.t.by.replace('{model}', s.model).replace('{date}', formatDate(s.created_at));
  }

  /** Create (or replace) the summary of the chosen length and stream it. */
  protected async create(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.streamed.set('');
    this.progress.set('');
    let text = '';
    try {
      await streamPost(
        `/documents/${this.documentId()}/summaries`,
        { length: this.length(), language: this.german() ? 'de' : 'source' },
        ({ event, data }) => {
          const payload = data as Record<string, unknown>;
          if (event === 'progress') this.progress.set(String(payload['label']));
          else if (event === 'reset') {
            text = '';
            this.streamed.set('');
          } else if (event === 'token') {
            text += String(payload['text']);
            this.streamed.set(text);
          } else if (event === 'done') {
            const saved = payload['summary'] as Summary;
            this.summaries.update((list) => [...list.filter((s) => s.length !== saved.length), saved]);
          } else if (event === 'error') {
            this.error.set(String(payload['message']));
          }
        },
        new AbortController().signal,
      );
    } catch (e) {
      this.error.set(e instanceof ApiRequestError ? e.message : de.summary.failed);
    } finally {
      this.busy.set(false);
      this.streamed.set('');
    }
  }

  /**
   * Copy a summary to the clipboard.
   * @param text - The summary text.
   */
  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show(de.summary.copied);
    } catch {
      this.toast.show(de.errors.unknown, 'danger');
    }
  }
}
