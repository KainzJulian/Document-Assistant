import { ChangeDetectionStrategy, Component, input, model, output, signal } from '@angular/core';
import { de } from '../../../core/i18n/de';
import { ButtonComponent } from '../../atoms/button/button.component';
import { InputComponent } from '../../atoms/input/input.component';
import { TextareaComponent } from '../../atoms/textarea/textarea.component';
import { DialogComponent } from '../dialog/dialog.component';

/** What the person typed when pasting text instead of importing a page. */
export interface PastedText {
  title: string;
  text: string;
}

/**
 * Dialog to add a web page by its address. If the page cannot be read, the page shows the reason
 * (`error`) and sets `offerText`, which adds a button to paste the text instead.
 *
 * The component only collects input; the page does the API calls and sets `busy` and `error`.
 */
@Component({
  selector: 'app-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, InputComponent, TextareaComponent, ButtonComponent],
  template: `
    <app-dialog [(open)]="open" [title]="mode() === 'url' ? t.title : t.titleText">
      @if (mode() === 'url') {
        <form (submit)="submitUrl($event)">
          <app-input [label]="t.urlLabel" [(value)]="url" type="text" placeholder="https://" [hint]="t.urlHint" [error]="error()" [autofocus]="true" />
        </form>
        @if (offerText()) {
          <app-button (click)="mode.set('text')">{{ t.pasteText }}</app-button>
        }
      } @else {
        <form class="space-y-4" (submit)="submitText($event)">
          <app-input [label]="t.textTitle" [(value)]="title" [autofocus]="true" />
          <app-textarea [label]="t.textLabel" [(value)]="text" [rows]="8" />
          @if (error()) { <p role="alert" class="text-sm text-danger">{{ error() }}</p> }
        </form>
        <app-button variant="quiet" (click)="mode.set('url')">{{ t.backToUrl }}</app-button>
      }
      <ng-container dialog-actions>
        <app-button (click)="open.set(false)">{{ c.cancel }}</app-button>
        @if (mode() === 'url') {
          <app-button variant="primary" [loading]="busy()" (click)="submitUrl()">{{ t.submitUrl }}</app-button>
        } @else {
          <app-button variant="primary" [loading]="busy()" (click)="submitText()">{{ t.submitText }}</app-button>
        }
      </ng-container>
    </app-dialog>
  `,
})
export class ImportDialogComponent {
  protected readonly t = de.importDialog;
  protected readonly c = de.common;
  protected readonly url = signal('');
  protected readonly title = signal('');
  protected readonly text = signal('');

  /** Whether the dialog is open (two-way). */
  readonly open = model(false);
  /** Which form is shown (two-way): the address or pasted text. */
  readonly mode = model<'url' | 'text'>('url');
  /** True while the page waits for the server. */
  readonly busy = input(false);
  /** Error text to show in the form. */
  readonly error = input('');
  /** Show the "Text einfügen" button (set after a page could not be read). */
  readonly offerText = input(false);
  /** Emits the address to import. */
  readonly importUrl = output<string>();
  /** Emits the pasted text. */
  readonly importText = output<PastedText>();

  /**
   * Send the address.
   * @param event - The form submit event, if sent with Enter.
   */
  protected submitUrl(event?: Event): void {
    event?.preventDefault();
    const value = this.url().trim();
    if (value) this.importUrl.emit(value);
  }

  /**
   * Send the pasted text.
   * @param event - The form submit event, if sent with Enter.
   */
  protected submitText(event?: Event): void {
    event?.preventDefault();
    const title = this.title().trim();
    const text = this.text().trim();
    if (title && text) this.importText.emit({ title, text });
  }

  /**
   * Suggest a title for pasted text (the host of the address that failed).
   * @param title - The suggested title.
   */
  suggestTitle(title: string): void {
    if (!this.title()) this.title.set(title);
  }
}
