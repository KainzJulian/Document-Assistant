import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Colour meaning of a badge. */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** Small pill with a short text, e.g. a role or a verdict. Meaning is always in the text. */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<span class="rounded-full px-2.5 py-0.5 text-xs font-medium" [class]="toneClass()"><ng-content /></span>`,
})
export class BadgeComponent {
  /** Colour meaning. */
  readonly tone = input<BadgeTone>('neutral');

  protected readonly toneClass = computed(() => TONES[this.tone()]);
}
