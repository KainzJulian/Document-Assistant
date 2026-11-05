import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChunkOut } from '../../../core/api';
import { de } from '../../../core/i18n/de';
import { SpinnerComponent } from '../../atoms/spinner/spinner.component';

/**
 * Side panel (bottom sheet on phones) with the passage behind a citation: document title, page,
 * section and the text, with a link to open the document. Shows "Dokument gelöscht" if the
 * document is gone.
 */
@Component({
  selector: 'app-citation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SpinnerComponent],
  template: `
    <aside
      [attr.aria-label]="t.sources"
      class="fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-card border border-border bg-surface p-5 shadow-xl lg:static lg:max-h-none lg:w-96 lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="text-xs font-semibold tracking-wide text-muted uppercase">{{ t.sources }} {{ number() }}</p>
        <button type="button" class="min-h-9 cursor-pointer rounded-control px-2 text-sm text-muted hover:text-foreground pointer-coarse:min-h-11" (click)="closed.emit()">{{ t.closeSource }}</button>
      </div>
      @if (loading()) {
        <div class="mt-4"><app-spinner /></div>
      } @else if (gone()) {
        <p class="mt-3 text-muted">{{ t.sourceGone }}</p>
      } @else if (chunk(); as c) {
        <h2 class="mt-1 font-semibold">{{ c.document_title }}</h2>
        @if (where()) { <p class="text-sm text-muted">{{ where() }}</p> }
        <blockquote class="mt-4 border-l-4 border-primary bg-primary-soft/50 py-3 pr-3 pl-4 font-serif leading-relaxed whitespace-pre-wrap">{{ c.text }}</blockquote>
        <a [routerLink]="['/library', c.document_id]" class="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-muted pointer-coarse:min-h-11">{{ t.openSource }}</a>
      }
    </aside>
  `,
})
export class CitationPanelComponent {
  protected readonly t = de.chat;

  /** The citation number shown in the heading. */
  readonly number = input.required<number>();
  /** The passage, once loaded. */
  readonly chunk = input<ChunkOut | null>(null);
  /** True while the passage loads. */
  readonly loading = input(false);
  /** True if the document was deleted. */
  readonly gone = input(false);
  /** Emits when the panel is closed. */
  readonly closed = output<void>();

  protected readonly where = computed(() => {
    const c = this.chunk();
    if (!c) return '';
    const pages = c.page_from ? `${de.chat.pageShort} ${c.page_from}${c.page_to && c.page_to !== c.page_from ? `-${c.page_to}` : ''}` : '';
    return [pages, c.section_path].filter(Boolean).join(' · ');
  });
}
