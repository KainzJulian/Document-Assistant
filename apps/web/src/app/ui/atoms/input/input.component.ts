import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, model, viewChild } from '@angular/core';

let nextId = 0;

/**
 * Single-line text field with a visible label, optional hint and error text.
 *
 * Use `[(value)]` for two-way binding. The error is linked to the field for screen readers.
 */
@Component({
  selector: 'app-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label [for]="id" class="mb-1.5 block text-sm font-medium" [class.sr-only]="hideLabel()">{{ label() }}</label>
    <input
      #field
      [id]="id"
      [type]="type()"
      [value]="value()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      [required]="required()"
      [attr.autocomplete]="autocomplete() || null"
      [attr.aria-invalid]="error() ? 'true' : null"
      [attr.aria-describedby]="error() ? id + '-error' : hint() ? id + '-hint' : null"
      class="min-h-10 w-full rounded-control border bg-surface px-3 text-base text-foreground placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11"
      [class]="error() ? 'border-danger' : 'border-border-strong'"
      (input)="onInput($event)"
    />
    @if (error()) {
      <p [id]="id + '-error'" class="mt-1.5 text-sm text-danger">{{ error() }}</p>
    } @else if (hint()) {
      <p [id]="id + '-hint'" class="mt-1.5 text-sm text-muted">{{ hint() }}</p>
    }
  `,
})
export class InputComponent {
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  protected readonly id = `app-input-${nextId++}`;

  /** Visible label (hidden visually with `hideLabel`, but always read by screen readers). */
  readonly label = input.required<string>();
  /** The current text. */
  readonly value = model('');
  /** Native input type. */
  readonly type = input<'text' | 'password' | 'search'>('text');
  /** Placeholder text. */
  readonly placeholder = input('');
  /** Help text under the field. */
  readonly hint = input('');
  /** Error text under the field; also turns the border red. */
  readonly error = input('');
  /** Browser autofill hint, e.g. `username` or `current-password`. */
  readonly autocomplete = input('');
  /** Marks the field as required. */
  readonly required = input(false);
  /** Disables the field. */
  readonly disabled = input(false);
  /** Hide the label visually (for search fields). */
  readonly hideLabel = input(false);
  /** Focus the field after the first render. */
  readonly autofocus = input(false);

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) this.field()?.nativeElement.focus();
    });
  }

  /**
   * Copy the typed text into the model.
   * @param event - The native input event.
   */
  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
