import { ChangeDetectionStrategy, Component, DestroyRef, inject, isDevMode, signal } from '@angular/core';
import { mountPrototypeSwitcher } from '../dev/prototype-switcher';
import { ProtoOllamaDialog } from './proto-bits';
import { VariantClassic } from './variant-classic';
import { VariantReading } from './variant-reading';
import { VariantWorkspace } from './variant-workspace';

const NAMES = ['Klassisch', 'Arbeitsbereich', 'Lesesaal'] as const;

/**
 * Renders the active shell prototype and mounts the dev-only switcher bar.
 * Remove this folder, `src/dev/` and the hook in `app.ts` after a variant is chosen.
 */
@Component({
  selector: 'app-prototypes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VariantClassic, VariantWorkspace, VariantReading, ProtoOllamaDialog],
  template: `
    @switch (active()) {
      @case (0) { <proto-classic /> }
      @case (1) { <proto-workspace /> }
      @case (2) { <proto-reading /> }
    }
    <proto-ollama-dialog />
  `,
})
export class PrototypesHost {
  protected readonly active = signal(0);

  constructor() {
    if (!isDevMode()) return;
    const switcher = mountPrototypeSwitcher(NAMES, { label: 'App-Shell' });
    this.active.set(switcher.index());
    const stop = switcher.subscribe((i) => this.active.set(i));
    inject(DestroyRef).onDestroy(() => {
      stop();
      switcher.destroy();
    });
  }
}
