import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SpinnerComponent } from '../spinner/spinner.component';

/** Visual weight of a button. */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'border border-border-strong bg-surface text-foreground hover:bg-surface-muted',
  quiet: 'text-foreground hover:bg-surface-muted',
  danger: 'bg-danger text-on-primary hover:opacity-90',
};

/**
 * Text button with a loading state. Touch targets grow to 44 px on touch screens.
 *
 * Listen to `(click)` on the element; a disabled or loading button does not emit it.
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent],
  host: { '[class]': 'hostClass()' },
  template: `<button
    [type]="type()"
    [disabled]="disabled() || loading()"
    [attr.aria-busy]="loading() || null"
    class="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-control font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
    [class]="classes()"
  >
    @if (loading()) {
      <app-spinner [size]="16" />
    }
    <ng-content />
  </button>`,
})
export class ButtonComponent {
  /** Visual weight. */
  readonly variant = input<ButtonVariant>('secondary');
  /** Control height: md is 40 px, sm is 32 px. */
  readonly size = input<'md' | 'sm'>('md');
  /** Native button type; use `submit` inside forms. */
  readonly type = input<'button' | 'submit'>('button');
  /** Disables the button. */
  readonly disabled = input(false);
  /** Shows a spinner and disables the button. */
  readonly loading = input(false);
  /** Stretch to the full width of the container. */
  readonly block = input(false);

  protected readonly hostClass = computed(() => (this.block() ? 'flex w-full' : 'inline-flex'));
  protected readonly classes = computed(
    () =>
      `${VARIANTS[this.variant()]} ${
        this.size() === 'md' ? 'min-h-10 px-4 text-sm' : 'min-h-8 px-3 text-sm'
      } pointer-coarse:min-h-11`,
  );
}
