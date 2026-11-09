import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { de } from '../../../core/i18n/de';

/** The five summary lengths with their word targets. */
export const LENGTHS = [
  { key: 'xs', words: 50 },
  { key: 's', words: 150 },
  { key: 'm', words: 300 },
  { key: 'l', words: 600 },
  { key: 'xl', words: 1200 },
] as const;

/**
 * Segmented control "Extra kurz · Kurz · Mittel · Lang · Extra lang" with the word target under
 * each option. Two-way bind `[(value)]` to the chosen key (`xs`, `s`, `m`, `l`, `xl`).
 */
@Component({
  selector: 'app-length-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div role="radiogroup" [attr.aria-label]="t.lengthLabel" class="grid grid-cols-5 gap-1 rounded-control border border-border-strong bg-surface p-1">
      @for (o of options; track o.key) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="value() === o.key"
          [disabled]="disabled()"
          class="min-h-12 cursor-pointer rounded-control px-1 py-1.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-14"
          [class]="value() === o.key ? 'bg-primary text-on-primary' : 'hover:bg-surface-muted'"
          (click)="value.set(o.key)"
        >
          <span class="block text-sm font-medium">{{ t.lengths[o.key] }}</span>
          <span class="block text-xs" [class]="value() === o.key ? 'opacity-90' : 'text-muted'">{{ t.words.replace('{n}', '' + o.words) }}</span>
        </button>
      }
    </div>
  `,
})
export class LengthSelectComponent {
  protected readonly t = de.summary;
  protected readonly options = LENGTHS;

  /** The chosen length key (two-way). */
  readonly value = model<'xs' | 's' | 'm' | 'l' | 'xl'>('m');
  /** Disables the control (while a summary is created). */
  readonly disabled = input(false);
}
