import { ChangeDetectionStrategy, Component, effect, input, model, output, signal } from '@angular/core';
import { ProviderForm, ProviderOut } from '../../../core/api';
import { de } from '../../../core/i18n/de';
import { ButtonComponent } from '../../atoms/button/button.component';
import { InputComponent } from '../../atoms/input/input.component';
import { DialogComponent } from '../dialog/dialog.component';

/**
 * Form to add a provider or edit one. The API key is write-only: when editing, a blank key
 * keeps the stored one. The page does the API call and sets `busy` and `error`.
 */
@Component({
  selector: 'app-provider-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, InputComponent, ButtonComponent],
  template: `
    <app-dialog [(open)]="open" [title]="provider() ? t.editProvider : t.addProvider">
      <form class="space-y-4" (submit)="submit($event)">
        <div>
          <label for="provider-kind" class="mb-1.5 block text-sm font-medium">{{ t.kind }}</label>
          <select id="provider-kind" class="min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-base pointer-coarse:min-h-11" [disabled]="!!provider()" (change)="onKind($event)">
            @for (k of kinds; track k) { <option [value]="k" [selected]="kind() === k">{{ t.kinds[k] }}</option> }
          </select>
        </div>
        <app-input [label]="t.label" [(value)]="label" [required]="true" />
        @if (kind() === 'ollama' || kind() === 'openai') {
          <app-input [label]="kind() === 'ollama' ? t.baseUrlOllama : t.baseUrl" [(value)]="baseUrl" placeholder="http://" />
        }
        @if (kind() !== 'ollama') {
          <app-input [label]="t.apiKey" [(value)]="apiKey" type="password" autocomplete="off" [hint]="provider() ? t.apiKeyKeep : ''" />
        }
        @if (error()) { <p role="alert" class="text-sm text-danger">{{ error() }}</p> }
      </form>
      <ng-container dialog-actions>
        <app-button (click)="open.set(false)">{{ c.cancel }}</app-button>
        <app-button variant="primary" [loading]="busy()" (click)="submit()">{{ c.save }}</app-button>
      </ng-container>
    </app-dialog>
  `,
})
export class ProviderDialogComponent {
  protected readonly t = de.settings;
  protected readonly c = de.common;
  protected readonly kinds = ['anthropic', 'openai', 'google', 'ollama'] as const;
  protected readonly kind = signal<string>('anthropic');
  protected readonly label = signal('');
  protected readonly baseUrl = signal('');
  protected readonly apiKey = signal('');

  /** Whether the dialog is open (two-way). */
  readonly open = model(false);
  /** The provider being edited, or null when adding. */
  readonly provider = input<ProviderOut | null>(null);
  /** True while the page saves. */
  readonly busy = input(false);
  /** Error text from the last save. */
  readonly error = input('');
  /** Emits the form when the person saves. */
  readonly saved = output<ProviderForm>();

  constructor() {
    // Fill the form each time the dialog opens.
    effect(() => {
      if (!this.open()) return;
      const p = this.provider();
      this.kind.set(p?.kind ?? 'anthropic');
      this.label.set(p?.label ?? '');
      this.baseUrl.set(p?.base_url ?? '');
      this.apiKey.set('');
    });
  }

  /**
   * Take the chosen kind and suggest a label.
   * @param event - The select change event.
   */
  protected onKind(event: Event): void {
    const kind = (event.target as HTMLSelectElement).value;
    this.kind.set(kind);
    if (!this.label()) this.label.set((de.settings.kinds as Record<string, string>)[kind] ?? kind);
  }

  /**
   * Emit the form.
   * @param event - The form submit event, if sent with Enter.
   */
  protected submit(event?: Event): void {
    event?.preventDefault();
    if (!this.label().trim()) return;
    this.saved.emit({
      kind: this.kind(),
      label: this.label().trim(),
      base_url: this.baseUrl().trim(),
      api_key: this.apiKey(),
    });
  }
}
