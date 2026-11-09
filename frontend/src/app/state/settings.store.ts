import { Injectable, inject, signal } from '@angular/core';
import { ApiClient, SettingsOut } from '../core/api';

/** The person's AI model choice and summary language, plus the providers they can choose from. */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly api = inject(ApiClient);

  /** Current settings, or null until loaded. */
  readonly settings = signal<SettingsOut | null>(null);

  /** Load the settings and the available choices. */
  async load(): Promise<void> {
    this.settings.set(await this.api.get<SettingsOut>('/settings'));
  }

  /**
   * Save the model choice and the summary language.
   * @param providerId - Chosen provider, or null for none.
   * @param model - Chosen model, or null for none.
   * @param summaryLanguage - `source` or `de`.
   */
  async save(providerId: number | null, model: string | null, summaryLanguage: string): Promise<void> {
    this.settings.set(
      await this.api.request<SettingsOut>('PUT', '/settings', {
        provider_id: providerId,
        model,
        summary_language: summaryLanguage,
      }),
    );
  }
}
