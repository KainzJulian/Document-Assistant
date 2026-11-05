import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ApiClient,
  ApiRequestError,
  BenchmarkOut,
  OllamaFit,
  ProviderChoice,
  ProviderForm,
  ProviderOut,
  ProviderTestOut,
} from '../../core/api';
import { de } from '../../core/i18n/de';
import { ToastService } from '../../core/toast.service';
import { SessionStore } from '../../state/session.store';
import { SettingsStore } from '../../state/settings.store';
import { BadgeComponent } from '../../ui/atoms/badge/badge.component';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { InputComponent } from '../../ui/atoms/input/input.component';
import { OllamaFitDialogComponent } from '../../ui/organisms/ollama-fit-dialog/ollama-fit-dialog.component';
import { ProviderDialogComponent } from '../../ui/organisms/provider-dialog/provider-dialog.component';

const SELECT =
  'min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-base text-foreground pointer-coarse:min-h-11';

/** Settings: AI model, summary language, account, and (for admins) the providers. */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputComponent, ButtonComponent, BadgeComponent, OllamaFitDialogComponent, ProviderDialogComponent],
  template: `
    <div class="mx-auto w-full max-w-2xl px-5 py-10">
      <h1 class="text-3xl font-semibold tracking-tight">{{ t.title }}</h1>

      <section class="mt-8 space-y-3" aria-labelledby="set-model">
        <h2 id="set-model" class="text-xl font-semibold">{{ t.modelTitle }}</h2>
        <p class="text-sm text-muted">{{ t.modelIntro }}</p>
        @if (choices().length === 0) {
          <p class="rounded-control border border-border bg-surface px-4 py-3 text-sm text-muted">{{ t.noModels }}</p>
        } @else {
          <label for="set-model-select" class="block text-sm font-medium">{{ t.modelLabel }}</label>
          <select id="set-model-select" [class]="select" [value]="current()" (change)="onModel($event)">
            <option value="">–</option>
            @for (p of choices(); track p.id) {
              <optgroup [label]="(p.local ? t.local : t.cloud) + ' · ' + p.label">
                @for (m of p.models; track m) { <option [value]="p.id + '|' + m" [selected]="current() === p.id + '|' + m">{{ m }}</option> }
              </optgroup>
            }
          </select>
          @if (currentFit(); as f) {
            @if (f.verdict !== 'fits') { <app-badge tone="warning">{{ fitLabels[f.verdict] }}</app-badge> }
          }
          @if (ollamaError()) { <p class="text-sm text-danger">{{ t.ollamaDown }}</p> }
        }
      </section>

      <section class="mt-10 space-y-3" aria-labelledby="set-sum">
        <h2 id="set-sum" class="text-xl font-semibold">{{ t.summaryTitle }}</h2>
        <div role="radiogroup" [attr.aria-label]="t.summaryLanguage" class="inline-flex rounded-control border border-border-strong bg-surface p-1">
          @for (o of languages; track o.value) {
            <button type="button" role="radio" [attr.aria-checked]="language() === o.value" class="min-h-9 cursor-pointer rounded-control px-4 text-sm font-medium pointer-coarse:min-h-11" [class]="language() === o.value ? 'bg-primary text-on-primary' : 'hover:bg-surface-muted'" (click)="setLanguage(o.value)">{{ o.label }}</button>
          }
        </div>
      </section>

      <section class="mt-10 space-y-4" aria-labelledby="set-acc">
        <h2 id="set-acc" class="text-xl font-semibold">{{ t.accountTitle }}</h2>
        <form class="flex max-w-sm items-end gap-2" (submit)="saveName($event)">
          <app-input class="flex-1" [label]="t.displayName" [(value)]="displayName" />
          <app-button type="submit">{{ t.saveName }}</app-button>
        </form>
        <form class="max-w-sm space-y-3" (submit)="changePassword($event)">
          <app-input [label]="t.currentPassword" [(value)]="currentPassword" type="password" autocomplete="current-password" />
          <app-input [label]="t.newPassword" [(value)]="newPassword" type="password" autocomplete="new-password" [error]="passwordError()" />
          <app-button type="submit">{{ t.changePassword }}</app-button>
        </form>
      </section>

      @if (isAdmin()) {
        <section class="mt-10" aria-labelledby="set-prov">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="set-prov" class="text-xl font-semibold">{{ t.providersTitle }}</h2>
            <app-button variant="primary" (click)="openProvider(null)">{{ t.addProvider }}</app-button>
          </div>
          <p class="mt-2 text-sm text-muted">{{ t.providersIntro }}</p>
          <ul class="mt-4 divide-y divide-border border-y border-border">
            @for (p of providers(); track p.id) {
              <li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">{{ p.label }} <span class="font-normal text-muted">· {{ kindLabel(p.kind) }}</span></p>
                  <p class="text-sm text-muted">{{ p.models.length }} {{ t.models }}</p>
                </div>
                @if (p.kind !== 'ollama') { <app-badge [tone]="p.has_key ? 'success' : 'warning'">{{ p.has_key ? t.keyStored : t.noKey }}</app-badge> }
                <app-badge [tone]="p.enabled ? 'success' : 'neutral'">{{ p.enabled ? t.enabled : t.disabled }}</app-badge>
                <span class="flex flex-wrap gap-1">
                  <app-button size="sm" [loading]="testingId() === p.id" (click)="test(p)">{{ t.test }}</app-button>
                  <app-button size="sm" variant="quiet" (click)="openProvider(p)">{{ t.edit }}</app-button>
                  <app-button size="sm" variant="quiet" (click)="toggle(p)">{{ p.enabled ? t.disable : t.enable }}</app-button>
                  <app-button size="sm" variant="quiet" (click)="remove(p)">{{ t.delete }}</app-button>
                </span>
              </li>
            }
          </ul>
        </section>
      }
    </div>

    <app-ollama-fit-dialog [(open)]="fitOpen" [fit]="pendingFit()" [measured]="measured()" [testing]="measuring()" (accepted)="acceptFit()" (runTest)="measure()" />
    <app-provider-dialog [(open)]="providerOpen" [provider]="editing()" [busy]="providerBusy()" [error]="providerError()" (saved)="saveProvider($event)" />
  `,
})
export class SettingsPage {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly store = inject(SettingsStore);
  private readonly session = inject(SessionStore);
  protected readonly t = de.settings;
  protected readonly select = SELECT;
  protected readonly fitLabels = de.fit.verdicts;
  protected readonly languages = [
    { value: 'source', label: de.settings.langSource },
    { value: 'de', label: de.settings.langDe },
  ];

  protected readonly isAdmin = computed(() => this.session.user()?.role === 'admin');
  protected readonly choices = computed<ProviderChoice[]>(() => (this.store.settings()?.providers ?? []).filter((p) => p.models.length > 0));
  protected readonly language = computed(() => this.store.settings()?.summary_language ?? 'source');
  protected readonly current = computed(() => {
    const s = this.store.settings();
    return s?.provider_id != null && s.model ? `${s.provider_id}|${s.model}` : '';
  });

  protected readonly displayName = signal(this.session.user()?.display_name ?? '');
  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly passwordError = signal('');

  protected readonly currentFit = signal<OllamaFit | null>(null);
  protected readonly ollamaError = signal(false);
  protected readonly fitOpen = signal(false);
  protected readonly pendingFit = signal<OllamaFit | null>(null);
  private pending: { providerId: number; model: string } | null = null;
  protected readonly measured = signal<number | null>(null);
  protected readonly measuring = signal(false);

  protected readonly providers = signal<ProviderOut[]>([]);
  protected readonly providerOpen = signal(false);
  protected readonly editing = signal<ProviderOut | null>(null);
  protected readonly providerBusy = signal(false);
  protected readonly providerError = signal('');
  protected readonly testingId = signal<number | null>(null);

  constructor() {
    void this.init();
  }

  /** Load settings, the current model's hardware check and (for admins) the providers. */
  private async init(): Promise<void> {
    try {
      await this.store.load();
    } catch (e) {
      this.fail(e);
    }
    void this.checkCurrent();
    if (this.isAdmin()) await this.loadProviders();
  }

  /**
   * Show an error as a toast.
   * @param e - The caught error.
   */
  private fail(e: unknown): void {
    this.toast.show(e instanceof ApiRequestError ? e.message : de.errors.unknown, 'danger');
  }

  /**
   * Whether a provider is the local Ollama.
   * @param providerId - Id of the provider.
   * @returns True for local providers.
   */
  private isLocal(providerId: number): boolean {
    return !!this.choices().find((p) => p.id === providerId)?.local;
  }

  /** Check the hardware fit of the currently chosen local model (for the warning badge). */
  private async checkCurrent(): Promise<void> {
    const s = this.store.settings();
    this.currentFit.set(null);
    if (!s?.model || s.provider_id == null || !this.isLocal(s.provider_id)) return;
    try {
      this.currentFit.set(await this.api.get<OllamaFit>(`/hardware/ollama-fit?model=${encodeURIComponent(s.model)}`));
      this.ollamaError.set(false);
    } catch {
      this.ollamaError.set(true);
    }
  }

  /**
   * The person picked a model. Local models are checked against the server first.
   * @param event - The select change event.
   */
  protected async onModel(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    if (!value) return this.saveModel(null, null);
    const [id, ...rest] = value.split('|');
    const providerId = Number(id);
    const model = rest.join('|');
    if (!this.isLocal(providerId)) return this.saveModel(providerId, model);
    try {
      const fit = await this.api.get<OllamaFit>(`/hardware/ollama-fit?model=${encodeURIComponent(model)}`);
      this.ollamaError.set(false);
      if (!fit.needs_warning) return this.saveModel(providerId, model);
      this.pending = { providerId, model };
      this.pendingFit.set(fit);
      this.measured.set(null);
      select.value = this.current();
      this.fitOpen.set(true);
    } catch (e) {
      select.value = this.current();
      this.ollamaError.set(e instanceof ApiRequestError && e.code === 'ollama_unreachable');
      this.fail(e);
    }
  }

  /** "Trotzdem verwenden": remember the acceptance and save the model. */
  protected async acceptFit(): Promise<void> {
    const fit = this.pendingFit();
    const pending = this.pending;
    if (!fit || !pending) return;
    try {
      await this.api.post('/settings/ollama-ack', { model: fit.model, verdict: fit.verdict });
    } catch (e) {
      this.fail(e);
    }
    this.fitOpen.set(false);
    await this.saveModel(pending.providerId, pending.model);
  }

  /** Run the 20 second speed test for the model in the dialog. */
  protected async measure(): Promise<void> {
    const fit = this.pendingFit();
    if (!fit) return;
    this.measuring.set(true);
    try {
      const result = await this.api.post<BenchmarkOut>('/hardware/ollama-benchmark', { model: fit.model });
      this.measured.set(result.words_per_s);
    } catch (e) {
      this.fail(e);
    } finally {
      this.measuring.set(false);
    }
  }

  /**
   * Save the chosen model.
   * @param providerId - Provider id, or null for none.
   * @param model - Model name, or null for none.
   */
  private async saveModel(providerId: number | null, model: string | null): Promise<void> {
    try {
      await this.store.save(providerId, model, this.language());
      this.toast.show(de.settings.saved);
      await this.checkCurrent();
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Save the summary language.
   * @param value - `source` or `de`.
   */
  protected async setLanguage(value: string): Promise<void> {
    const s = this.store.settings();
    try {
      await this.store.save(s?.provider_id ?? null, s?.model ?? null, value);
      this.toast.show(de.settings.saved);
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Save the display name.
   * @param event - The form submit event.
   */
  protected async saveName(event: Event): Promise<void> {
    event.preventDefault();
    try {
      await this.api.patch('/auth/me', { display_name: this.displayName().trim() });
      await this.session.ensureLoaded();
      this.session.user.update((u) => (u ? { ...u, display_name: this.displayName().trim() } : u));
      this.toast.show(de.settings.saved);
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Change the password (needs the current one).
   * @param event - The form submit event.
   */
  protected async changePassword(event: Event): Promise<void> {
    event.preventDefault();
    this.passwordError.set('');
    if (this.newPassword().length < 8) {
      this.passwordError.set(de.admin.passwordTooShort);
      return;
    }
    try {
      await this.api.patch('/auth/me', { current_password: this.currentPassword(), new_password: this.newPassword() });
      this.currentPassword.set('');
      this.newPassword.set('');
      this.toast.show(de.settings.passwordChanged);
    } catch (e) {
      this.passwordError.set(e instanceof ApiRequestError ? e.message : de.errors.unknown);
    }
  }

  /** Load the providers (admin). */
  private async loadProviders(): Promise<void> {
    try {
      this.providers.set(await this.api.get<ProviderOut[]>('/admin/providers'));
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Display name of a provider kind.
   * @param kind - `anthropic`, `openai`, `google` or `ollama`.
   * @returns The name.
   */
  protected kindLabel(kind: string): string {
    return (de.settings.kinds as Record<string, string>)[kind] ?? kind;
  }

  /**
   * Open the provider form.
   * @param provider - The provider to edit, or null to add one.
   */
  protected openProvider(provider: ProviderOut | null): void {
    this.editing.set(provider);
    this.providerError.set('');
    this.providerOpen.set(true);
  }

  /**
   * Save the provider form (add or edit).
   * @param form - The form values.
   */
  protected async saveProvider(form: ProviderForm): Promise<void> {
    this.providerBusy.set(true);
    this.providerError.set('');
    const editing = this.editing();
    try {
      if (editing) {
        await this.api.patch(`/admin/providers/${editing.id}`, { label: form.label, base_url: form.base_url, api_key: form.api_key });
      } else {
        await this.api.post('/admin/providers', {
          kind: form.kind,
          label: form.label,
          base_url: form.base_url || null,
          api_key: form.api_key || null,
        });
      }
      this.providerOpen.set(false);
      this.toast.show(de.settings.saved);
      await this.loadProviders();
    } catch (e) {
      this.providerError.set(e instanceof ApiRequestError ? e.message : de.errors.unknown);
    } finally {
      this.providerBusy.set(false);
    }
  }

  /**
   * Test the connection and refresh the model list.
   * @param p - The provider.
   */
  protected async test(p: ProviderOut): Promise<void> {
    this.testingId.set(p.id);
    try {
      const result = await this.api.post<ProviderTestOut>(`/admin/providers/${p.id}/test`);
      this.toast.show(result.message, result.ok ? 'success' : 'danger');
      await this.loadProviders();
      await this.store.load();
    } catch (e) {
      this.fail(e);
    } finally {
      this.testingId.set(null);
    }
  }

  /**
   * Enable or disable a provider.
   * @param p - The provider.
   */
  protected async toggle(p: ProviderOut): Promise<void> {
    try {
      await this.api.patch(`/admin/providers/${p.id}`, { enabled: !p.enabled });
      await this.loadProviders();
      await this.store.load();
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Delete a provider.
   * @param p - The provider.
   */
  protected async remove(p: ProviderOut): Promise<void> {
    try {
      await this.api.delete(`/admin/providers/${p.id}`);
      await this.loadProviders();
      await this.store.load();
    } catch (e) {
      this.fail(e);
    }
  }
}
