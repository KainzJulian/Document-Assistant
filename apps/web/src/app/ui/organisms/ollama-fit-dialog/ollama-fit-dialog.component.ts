import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { OllamaFit } from '../../../core/api';
import { de } from '../../../core/i18n/de';
import { BadgeComponent } from '../../atoms/badge/badge.component';
import { ButtonComponent } from '../../atoms/button/button.component';
import { DialogComponent } from '../dialog/dialog.component';

/**
 * Warning shown when a local model does not fit the server well: the numbers, the verdict and
 * the buttons "Trotzdem verwenden" and "Abbrechen". The page does the API calls.
 */
@Component({
  selector: 'app-ollama-fit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ButtonComponent, BadgeComponent],
  template: `
    <app-dialog [(open)]="open" [title]="title()" [description]="intro()">
      @if (fit(); as f) {
        <dl class="divide-y divide-border rounded-control border border-border text-sm">
          <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">{{ t.ram }}</dt><dd class="text-right">{{ ram() }}</dd></div>
          <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">{{ t.gpu }}</dt><dd class="text-right">{{ gpu() }}</dd></div>
          <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">{{ t.need }}</dt><dd>{{ f.need_gb }} GB</dd></div>
          <div class="flex items-center justify-between gap-4 px-3 py-2"><dt class="text-muted">{{ t.verdict }}</dt><dd><app-badge [tone]="f.verdict === 'too_big' ? 'danger' : 'warning'">{{ t.verdicts[f.verdict] }}</app-badge></dd></div>
          @if (speed()) { <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">{{ t.speed }}</dt><dd class="text-right">{{ speed() }}</dd></div> }
        </dl>
        <app-button variant="quiet" size="sm" [loading]="testing()" (click)="runTest.emit()">{{ testing() ? t.testing : t.test }}</app-button>
      }
      <ng-container dialog-actions>
        <app-button (click)="open.set(false)">{{ t.cancel }}</app-button>
        <app-button variant="primary" (click)="accepted.emit()">{{ t.accept }}</app-button>
      </ng-container>
    </app-dialog>
  `,
})
export class OllamaFitDialogComponent {
  protected readonly t = de.fit;

  /** Whether the dialog is open (two-way). Closing it without accepting means "Abbrechen". */
  readonly open = model(false);
  /** The hardware check result to show. */
  readonly fit = input<OllamaFit | null>(null);
  /** Measured speed in words per second, if the speed test ran. */
  readonly measured = input<number | null>(null);
  /** True while the speed test runs. */
  readonly testing = input(false);
  /** Emits when "Trotzdem verwenden" is pressed. */
  readonly accepted = output<void>();
  /** Emits when "Geschwindigkeit testen" is pressed. */
  readonly runTest = output<void>();

  protected readonly title = computed(() => {
    const v = this.fit()?.verdict;
    if (v === 'partial') return this.t.titlePartial;
    if (v === 'too_big') return this.t.titleBig;
    return this.t.titleCpu;
  });
  protected readonly intro = computed(() => {
    const f = this.fit();
    if (!f) return '';
    const estimate = f.est_words_per_s ? this.t.speedEstimate.replace('{n}', String(f.est_words_per_s)) : '';
    return `${f.model}${estimate ? ` (${estimate})` : ''}`;
  });
  protected readonly ram = computed(() => {
    const f = this.fit();
    return f ? this.t.ramValue.replace('{total}', String(f.ram_total_gb)).replace('{free}', String(f.ram_free_gb)) : '';
  });
  protected readonly gpu = computed(() => {
    const g = this.fit()?.gpu;
    return g
      ? this.t.gpuValue.replace('{name}', g.name).replace('{free}', String(g.vram_free_gb)).replace('{total}', String(g.vram_total_gb))
      : this.t.noGpu;
  });
  protected readonly speed = computed(() => {
    const m = this.measured();
    if (m !== null) return this.t.measured.replace('{n}', String(m));
    const e = this.fit()?.est_words_per_s;
    return e ? this.t.speedEstimate.replace('{n}', String(e)) : '';
  });
}
