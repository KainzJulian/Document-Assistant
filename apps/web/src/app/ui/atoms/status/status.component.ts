import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { de } from '../../../core/i18n/de';

/** Processing state of a document. */
export type DocumentStatus = 'queued' | 'reading' | 'indexing' | 'ready' | 'failed';

const DOT: Record<DocumentStatus, string> = {
  queued: 'bg-border-strong',
  reading: 'bg-primary animate-pulse',
  indexing: 'bg-primary animate-pulse',
  ready: 'bg-success',
  failed: 'bg-danger',
};
const TEXT: Record<DocumentStatus, string> = {
  queued: 'text-muted',
  reading: 'text-primary',
  indexing: 'text-primary',
  ready: 'text-success',
  failed: 'text-danger',
};

/** Document status as a coloured dot plus a word; the meaning is never colour alone. */
@Component({
  selector: 'app-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<span class="inline-flex items-center gap-1.5 text-sm font-medium" [class]="text()">
    <span class="size-2 rounded-full" [class]="dot()"></span>{{ label() }}
  </span>`,
})
export class StatusComponent {
  /** The status key from the API. */
  readonly status = input.required<string>();

  protected readonly label = computed(() => de.status[this.status() as DocumentStatus] ?? this.status());
  protected readonly dot = computed(() => DOT[this.status() as DocumentStatus] ?? DOT.queued);
  protected readonly text = computed(() => TEXT[this.status() as DocumentStatus] ?? TEXT.queued);
}
