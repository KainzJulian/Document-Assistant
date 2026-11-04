import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { de } from '../../../core/i18n/de';

/** Small rotating ring for loading states; inherits the text colour. */
@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', role: 'status' },
  template: `<span
    class="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
    [style.width.px]="size()"
    [style.height.px]="size()"
  ></span
  ><span class="sr-only">{{ label() }}</span>`,
})
export class SpinnerComponent {
  /** Diameter in pixels. */
  readonly size = input(16);
  /** Text read by screen readers. */
  readonly label = input<string>(de.common.loading);
}
