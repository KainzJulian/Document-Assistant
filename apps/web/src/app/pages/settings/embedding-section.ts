import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ApiClient, ApiRequestError } from '../../core/api';
import { de } from '../../core/i18n/de';
import { ToastService } from '../../core/toast.service';
import { ButtonComponent } from '../../ui/atoms/button/button.component';

/** An embedding model as returned by the API. */
interface EmbeddingModel {
  id: number;
  provider: string;
  model: string;
  dims: number;
  status: string;
  progress: number;
}

/** A provider with the embedding models it offers. */
interface Candidate {
  provider_kind: string;
  provider_label: string;
  models: string[];
}

/** Admin section "Embedding-Modell": the active model, the build progress and the switch form. */
@Component({
  selector: 'app-embedding-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  template: `
    <section class="mt-10" aria-labelledby="set-emb">
      <h2 id="set-emb" class="text-xl font-semibold">{{ t.title }}</h2>
      <p class="mt-2 text-sm text-muted">{{ t.intro }}</p>

      <div class="mt-4 space-y-3 rounded-card border border-border bg-surface p-5">
        @if (active(); as a) {
          <p class="text-sm"><span class="font-medium">{{ t.active }}:</span> {{ a.model }} ({{ a.provider }}, {{ a.dims }} {{ t.dims }})</p>
        } @else {
          <p class="text-sm text-muted">{{ t.none }}</p>
        }
        @if (building(); as b) {
          <div>
            <p class="text-sm">{{ t.building }}: {{ b.model }} · {{ percent(b) }} %</p>
            <progress class="mt-1 h-2 w-full accent-primary" max="1" [value]="b.progress" [attr.aria-label]="t.building"></progress>
          </div>
        }
        @if (failed(); as f) { <p class="text-sm text-danger">{{ t.failed }}: {{ f.model }}</p> }
      </div>

      @if (options().length === 0) {
        <p class="mt-4 text-sm text-muted">{{ t.noCandidates }}</p>
      } @else if (!building()) {
        <form class="mt-4 flex flex-wrap items-end gap-2" (submit)="start($event)">
          <div class="min-w-64 flex-1">
            <label for="emb-select" class="mb-1.5 block text-sm font-medium">{{ t.choose }}</label>
            <select id="emb-select" class="min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-base pointer-coarse:min-h-11" (change)="onChoice($event)">
              @for (o of options(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
            </select>
          </div>
          <app-button type="submit" variant="primary" [loading]="busy()">{{ t.switch }}</app-button>
        </form>
      }
    </section>
  `,
})
export class EmbeddingSection implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private timer: ReturnType<typeof setInterval> | undefined;
  protected readonly t = de.embedding;
  protected readonly models = signal<EmbeddingModel[]>([]);
  protected readonly candidates = signal<Candidate[]>([]);
  protected readonly choice = signal('');
  protected readonly busy = signal(false);

  protected readonly active = computed(() => this.models().find((m) => m.status === 'active') ?? null);
  protected readonly building = computed(() => this.models().find((m) => m.status === 'building') ?? null);
  // A retired model that never reached 100 percent is a failed build (only the newest one is shown).
  protected readonly failed = computed(() => {
    const newest = this.models()[0];
    return newest && newest.status === 'retired' && newest.progress < 1 ? newest : null;
  });
  protected readonly options = computed(() =>
    this.candidates().flatMap((c) => c.models.map((m) => ({ value: `${c.provider_kind}|${m}`, label: `${m} (${c.provider_label})` }))),
  );

  constructor() {
    void this.load();
    this.timer = setInterval(() => {
      if (this.building()) void this.loadModels();
    }, 3000);
  }

  /** Stop polling. */
  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  /** Load models and candidates, and preselect the first option. */
  private async load(): Promise<void> {
    await this.loadModels();
    try {
      this.candidates.set(await this.api.get<Candidate[]>('/admin/embedding-candidates'));
      this.choice.set(this.options()[0]?.value ?? '');
    } catch (e) {
      this.fail(e);
    }
  }

  /** Reload the model list (progress). */
  private async loadModels(): Promise<void> {
    try {
      this.models.set(await this.api.get<EmbeddingModel[]>('/admin/embedding-models'));
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Show an error as a toast.
   * @param e - The caught error.
   */
  private fail(e: unknown): void {
    this.toast.show(e instanceof ApiRequestError ? e.message : de.errors.unknown, 'danger');
  }

  /**
   * Remember the chosen option.
   * @param event - The select change event.
   */
  protected onChoice(event: Event): void {
    this.choice.set((event.target as HTMLSelectElement).value);
  }

  /**
   * Progress as a whole percent.
   * @param m - The model.
   * @returns 0 to 100.
   */
  protected percent(m: EmbeddingModel): number {
    return Math.round(m.progress * 100);
  }

  /**
   * Start building the chosen model.
   * @param event - The form submit event.
   */
  protected async start(event: Event): Promise<void> {
    event.preventDefault();
    const [provider, ...rest] = this.choice().split('|');
    if (!provider) return;
    this.busy.set(true);
    try {
      await this.api.post('/admin/embedding-models', { provider, model: rest.join('|') });
      this.toast.show(de.embedding.started);
      await this.loadModels();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }
}
