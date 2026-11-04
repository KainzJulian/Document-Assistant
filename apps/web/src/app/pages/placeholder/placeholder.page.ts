import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { de } from '../../core/i18n/de';
import { EmptyStateComponent } from '../../ui/molecules/empty-state/empty-state.component';

/** Stand-in for sections that are built in later waves; the title comes from the route data. */
@Component({
  selector: 'app-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent],
  template: `
    <div class="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 class="mb-8 text-3xl font-semibold tracking-tight">{{ title }}</h1>
      <app-empty-state [title]="title" [description]="t.common.soon" />
    </div>
  `,
})
export class PlaceholderPage {
  protected readonly t = de;
  protected readonly title = String(inject(ActivatedRoute).snapshot.data['title'] ?? '');
}
