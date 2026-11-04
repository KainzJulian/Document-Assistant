import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Friendly "nothing here yet" block with a title, a short text and an optional action. */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<div class="mx-auto max-w-md rounded-card border border-dashed border-border-strong px-6 py-10 text-center">
    <h2 class="text-lg font-semibold">{{ title() }}</h2>
    @if (description()) {
      <p class="mt-2 text-sm text-muted">{{ description() }}</p>
    }
    <div class="mt-5 empty:hidden"><ng-content /></div>
  </div>`,
})
export class EmptyStateComponent {
  /** Heading. */
  readonly title = input.required<string>();
  /** Short explanation. */
  readonly description = input('');
}
