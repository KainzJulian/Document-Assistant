import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

let nextId = 0;

/** Multi-line text field with a visible label; use `[(value)]` for two-way binding. */
@Component({
  selector: 'app-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label [for]="id" class="mb-1.5 block text-sm font-medium" [class.sr-only]="hideLabel()">{{ label() }}</label>
    <textarea
      [id]="id"
      [rows]="rows()"
      [value]="value()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      class="w-full resize-y rounded-control border border-border-strong bg-surface p-3 text-base text-foreground placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50"
      (input)="onInput($event)"
    ></textarea>
  `,
})
export class TextareaComponent {
  protected readonly id = `app-textarea-${nextId++}`;

  /** Visible label. */
  readonly label = input.required<string>();
  /** The current text. */
  readonly value = model('');
  /** Visible rows. */
  readonly rows = input(3);
  /** Placeholder text. */
  readonly placeholder = input('');
  /** Disables the field. */
  readonly disabled = input(false);
  /** Hide the label visually. */
  readonly hideLabel = input(false);

  /**
   * Copy the typed text into the model.
   * @param event - The native input event.
   */
  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }
}
