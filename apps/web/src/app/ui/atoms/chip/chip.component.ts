import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { SpinnerComponent } from '../spinner/spinner.component';

/** Colour meaning of a chip. */
export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-muted text-foreground',
  info: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/**
 * Compact pill for statuses, selected documents and verdicts.
 *
 * Meaning is never carried by colour alone: pair the tone with a text label and,
 * where useful, an icon.
 */
@Component({
  selector: 'app-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SpinnerComponent],
  host: { class: 'inline-flex max-w-full' },
  template: `<span
    class="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
    [class]="toneClass()"
  >
    @if (busy()) {
      <app-spinner [size]="12" />
    } @else if (icon(); as name) {
      <app-icon [name]="name" [size]="14" />
    }
    <span class="truncate"><ng-content /></span>
    @if (removable()) {
      <button
        type="button"
        class="-mr-1 grid size-5 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
        [attr.aria-label]="removeLabel()"
        (click)="removed.emit()"
      >
        <app-icon name="x" [size]="12" />
      </button>
    }
  </span>`,
})
export class ChipComponent {
  /** Colour meaning. */
  readonly tone = input<ChipTone>('neutral');
  /** Optional leading icon. */
  readonly icon = input<IconName | null>(null);
  /** Show a spinner instead of the icon (work in progress). */
  readonly busy = input(false);
  /** Show a remove button. */
  readonly removable = input(false);
  /** Accessible name of the remove button. */
  readonly removeLabel = input('Entfernen');
  /** Emits when the remove button is pressed. */
  readonly removed = output<void>();

  protected readonly toneClass = computed(() => TONES[this.tone()]);
}
