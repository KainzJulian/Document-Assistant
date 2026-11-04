import { ChangeDetectionStrategy, Component, ElementRef, effect, input, model, viewChild } from '@angular/core';

let nextId = 0;

/**
 * Modal dialog built on the native `<dialog>` element, so focus trapping, Esc and the inert
 * background come from the browser.
 *
 * Put the body in the default slot and the buttons in an element with the `dialog-actions`
 * attribute. Bind `[(open)]` to show and hide it.
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<!-- INFO: The backdrop click is a pointer convenience; keyboard users close with Esc (native). -->
    <!-- eslint-disable @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
    <dialog
    #dlg
    class="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-overlay"
    [attr.aria-labelledby]="titleId"
    (close)="open.set(false)"
    (click)="onBackdrop($event)"
  >
    <div class="space-y-4 p-6">
      <div>
        <h2 [id]="titleId" class="text-xl leading-snug font-semibold">{{ title() }}</h2>
        @if (description()) {
          <p class="mt-2 text-sm text-muted">{{ description() }}</p>
        }
      </div>
      <ng-content />
    </div>
    <div class="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-muted px-6 py-4">
      <ng-content select="[dialog-actions]" />
    </div>
  </dialog>
    <!-- eslint-enable @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->`,
})
export class DialogComponent {
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly titleId = `app-dialog-title-${nextId++}`;

  /** Whether the dialog is open (two-way). */
  readonly open = model(false);
  /** Heading; also the accessible name. */
  readonly title = input.required<string>();
  /** Optional short text under the heading. */
  readonly description = input('');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.open()) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  /**
   * Close when the dimmed area around the dialog is clicked.
   * @param event - The click event.
   */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) this.open.set(false);
  }
}
