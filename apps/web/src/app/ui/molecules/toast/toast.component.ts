import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { de } from '../../../core/i18n/de';

/** Colour meaning of a toast. */
export type ToastMessageTone = 'success' | 'danger';

/**
 * One short message with a close button. Errors use `role="alert"` (read out at once),
 * successes `role="status"` (read out politely).
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<div
    class="flex items-start gap-3 rounded-card border bg-surface px-4 py-3 shadow-lg"
    [class]="tone() === 'danger' ? 'border-danger' : 'border-primary'"
    [attr.role]="tone() === 'danger' ? 'alert' : 'status'"
  >
    <p class="min-w-0 flex-1 text-sm" [class]="textClass()">{{ message() }}</p>
    <button
      type="button"
      class="min-h-8 cursor-pointer rounded-control px-2 text-sm text-muted hover:text-foreground pointer-coarse:min-h-11"
      (click)="dismissed.emit()"
    >
      {{ closeLabel() }}
    </button>
  </div>`,
})
export class ToastComponent {
  /** Colour meaning. */
  readonly tone = input<ToastMessageTone>('success');
  /** The message text. */
  readonly message = input.required<string>();
  /** Text of the close button. */
  readonly closeLabel = input<string>(de.nav.close);
  /** Emits when the close button is pressed. */
  readonly dismissed = output<void>();

  protected readonly textClass = computed(() => (this.tone() === 'danger' ? 'text-danger' : 'text-foreground'));
}
