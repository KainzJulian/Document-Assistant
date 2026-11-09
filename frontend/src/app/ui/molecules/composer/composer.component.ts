import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { de } from '../../../core/i18n/de';
import { ButtonComponent } from '../../atoms/button/button.component';

/**
 * Question box: a text area with "Senden", which becomes "Stopp" while an answer streams.
 * Enter sends, Shift+Enter starts a new line.
 */
@Component({
  selector: 'app-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  host: { class: 'block' },
  template: `
    <form
      class="rounded-card border border-border-strong bg-surface p-2 shadow-sm focus-within:outline-2 focus-within:outline-primary"
      (submit)="submit($event)"
    >
      <label class="sr-only" for="composer-text">{{ t.composerLabel }}</label>
      <textarea
        id="composer-text"
        rows="2"
        class="w-full resize-none bg-transparent p-2 text-base outline-none placeholder:text-muted"
        [placeholder]="t.placeholder"
        [value]="value()"
        [disabled]="disabled()"
        (input)="onInput($event)"
        (keydown.enter)="onEnter($event)"
      ></textarea>
      <div class="flex items-center justify-between gap-3 px-1 pb-1">
        <span class="truncate text-xs text-muted">{{ hint() }}</span>
        @if (busy()) {
          <app-button (click)="stopped.emit()">{{ t.stop }}</app-button>
        } @else {
          <app-button type="submit" variant="primary" [disabled]="disabled() || !value().trim()">{{ t.send }}</app-button>
        }
      </div>
    </form>
  `,
})
export class ComposerComponent {
  protected readonly t = de.chat;

  /** The text in the box (two-way). */
  readonly value = model('');
  /** True while an answer streams: shows "Stopp" instead of "Senden". */
  readonly busy = input(false);
  /** Disables the box. */
  readonly disabled = input(false);
  /** Small text under the box. */
  readonly hint = input<string>(de.chat.hint);
  /** Emits the question when sent (the page clears `value`). */
  readonly submitted = output<string>();
  /** Emits when "Stopp" is pressed. */
  readonly stopped = output<void>();

  /**
   * Copy the typed text into the model.
   * @param event - The input event.
   */
  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Enter sends; Shift+Enter keeps the new line.
   * @param event - The keydown event.
   */
  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;
    event.preventDefault();
    this.submit();
  }

  /**
   * Send the question if there is one and no answer is streaming.
   * @param event - The form submit event, if sent with the button.
   */
  protected submit(event?: Event): void {
    event?.preventDefault();
    const text = this.value().trim();
    if (text && !this.busy() && !this.disabled()) this.submitted.emit(text);
  }
}
