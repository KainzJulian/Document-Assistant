import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, isDevMode, signal } from '@angular/core';
import { mountPrototypeSwitcher } from '../dev/prototype-switcher';
import { ProtoOllamaDialog } from './proto-bits';
import { VariantLagune } from './variant-lagune';
import { VariantSalbei } from './variant-salbei';
import { VariantTinte } from './variant-tinte';

const NAMES = ['Salbei', 'Tinte', 'Lagune'] as const;
const THEMES = ['theme-salbei', 'theme-tinte', 'theme-lagune'] as const;

/**
 * Renders the active shell prototype inside its own theme and mounts the dev-only switcher bar.
 * Remove this folder, `src/dev/` and the hook in `app.ts` after a variant is chosen.
 */
@Component({
  selector: 'app-prototypes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VariantSalbei, VariantTinte, VariantLagune, ProtoOllamaDialog],
  template: `
    <div [class]="theme()" class="min-h-dvh bg-background text-foreground">
      @switch (active()) {
        @case (0) { <proto-salbei /> }
        @case (1) { <proto-tinte /> }
        @case (2) { <proto-lagune /> }
      }
      <proto-ollama-dialog />
    </div>
  `,
})
export class PrototypesHost {
  protected readonly active = signal(0);
  protected readonly theme = computed(() => THEMES[this.active()]);

  constructor() {
    if (!isDevMode()) return;
    const switcher = mountPrototypeSwitcher(NAMES, { label: 'Design' });
    this.active.set(switcher.index());
    const stop = switcher.subscribe((i) => this.active.set(i));
    inject(DestroyRef).onDestroy(() => {
      stop();
      switcher.destroy();
    });
  }
}
