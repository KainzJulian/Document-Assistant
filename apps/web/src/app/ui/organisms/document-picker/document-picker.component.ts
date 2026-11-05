import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { de } from '../../../core/i18n/de';
import { ButtonComponent } from '../../atoms/button/button.component';
import { InputComponent } from '../../atoms/input/input.component';

/** A document in the picker. */
export interface PickerDocument {
  id: string;
  title: string;
  /** Small grey text, e.g. "PDF · 12 Seiten". */
  meta: string;
}

/**
 * Searchable checklist of documents with "Alle auswählen". Only pass documents that can be used
 * (status "Bereit"). Two-way bind `[(selected)]` to the chosen ids.
 */
@Component({
  selector: 'app-document-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputComponent, ButtonComponent],
  host: { class: 'block' },
  template: `
    <div class="rounded-card border border-border bg-surface">
      <div class="flex items-center gap-2 p-2">
        <app-input class="flex-1" [label]="t.searchDocs" [hideLabel]="true" type="search" [placeholder]="t.searchDocs" [(value)]="query" />
        <app-button variant="quiet" size="sm" (click)="toggleAll()">{{ t.selectAll }}</app-button>
      </div>
      <ul class="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
        @for (d of visible(); track d.id) {
          <li>
            <label class="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-1.5 hover:bg-surface-muted">
              <input type="checkbox" class="size-4 accent-primary" [checked]="isSelected(d.id)" (change)="toggle(d.id)" />
              <span class="min-w-0 flex-1 truncate">{{ d.title }}</span>
              <span class="shrink-0 text-xs text-muted">{{ d.meta }}</span>
            </label>
          </li>
        } @empty {
          <li class="px-4 py-6 text-center text-sm text-muted">{{ t.noReadyDocs }}</li>
        }
      </ul>
    </div>
  `,
})
export class DocumentPickerComponent {
  protected readonly t = de.chat;
  protected readonly query = signal('');

  /** The documents to choose from. */
  readonly documents = input.required<PickerDocument[]>();
  /** Ids of the chosen documents (two-way). */
  readonly selected = model<string[]>([]);

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.documents().filter((d) => d.title.toLowerCase().includes(q)) : this.documents();
  });

  /**
   * Whether a document is chosen.
   * @param id - Document id.
   * @returns True if chosen.
   */
  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  /**
   * Choose or unchoose a document.
   * @param id - Document id.
   */
  protected toggle(id: string): void {
    this.selected.update((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  /** Choose all shown documents, or none if all are already chosen. */
  protected toggleAll(): void {
    const shown = this.visible().map((d) => d.id);
    const all = shown.every((id) => this.selected().includes(id));
    this.selected.update((ids) => (all ? ids.filter((id) => !shown.includes(id)) : [...new Set([...ids, ...shown])]));
  }
}
