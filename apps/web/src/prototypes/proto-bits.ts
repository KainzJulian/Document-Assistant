import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, viewChild } from '@angular/core';
import { ButtonComponent } from '../app/ui/atoms/button/button.component';
import { ChipComponent } from '../app/ui/atoms/chip/chip.component';
import { IconComponent } from '../app/ui/atoms/icon/icon.component';
import { CHATS, DocStatus, MODELS, ProtoModel, STATUS } from './proto-data';
import { ProtoState } from './proto-state';

/** Chip that shows a document's processing status. */
@Component({
  selector: 'proto-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent],
  template: `<app-chip [tone]="s().tone" [busy]="s().busy" [icon]="icon()">{{ s().label }}</app-chip>`,
})
export class ProtoStatus {
  /** Status to show. */
  readonly status = input.required<DocStatus>();
  protected readonly s = computed(() => STATUS[this.status()]);
  protected readonly icon = computed(() =>
    this.status() === 'ready' ? 'check' : this.status() === 'failed' ? 'alert-triangle' : null,
  );
}

/** Question input with send button. */
@Component({
  selector: 'proto-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `<form
    class="rounded-card border border-border-strong bg-surface p-2 shadow-sm focus-within:outline-2 focus-within:outline-primary"
    (submit)="$event.preventDefault()"
  >
    <label class="sr-only" for="proto-msg">Frage an die Dokumente</label>
    <textarea
      id="proto-msg"
      rows="2"
      class="w-full resize-none bg-transparent p-2 text-base outline-none placeholder:text-muted"
      placeholder="Stelle eine Frage zu deinen Dokumenten …"
    ></textarea>
    <div class="flex items-center justify-between gap-2 px-1 pb-0.5">
      <span class="truncate text-xs text-muted">{{ hint() }}</span>
      <button
        type="submit"
        aria-label="Senden"
        class="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-on-primary transition-opacity hover:opacity-90 pointer-coarse:size-11"
      >
        <app-icon name="arrow-up" [size]="20" />
      </button>
    </div>
  </form>`,
})
export class ProtoComposer {
  /** Small text next to the send button. */
  readonly hint = input('Antworten nutzen nur die ausgewählten Dokumente.');
}

/** Chats grouped by date, as in the sidebar. */
@Component({
  selector: 'proto-chat-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav aria-label="Chats">
    @for (g of groups; track g.name) {
      <h3 class="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{{ g.name }}</h3>
      <ul>
        @for (c of g.items; track c.id) {
          <li>
            <button
              type="button"
              class="group flex w-full cursor-pointer items-center gap-2 rounded-control px-3 text-left text-sm transition-colors hover:bg-surface-muted"
              [class]="(dense() ? 'min-h-8 ' : 'min-h-10 ') + (isActive(c.id) ? 'bg-primary-soft font-medium text-primary hover:bg-primary-soft' : 'text-foreground')"
              [attr.aria-current]="isActive(c.id) ? 'page' : null"
              (click)="state.go('chat')"
            >
              <span class="truncate">{{ c.title }}</span>
            </button>
          </li>
        }
      </ul>
    }
  </nav>`,
})
export class ProtoChatList {
  protected readonly state = inject(ProtoState);
  /** Tighter rows. */
  readonly dense = input(false);
  protected readonly groups = ['Heute', 'Gestern', 'Letzte 7 Tage', 'Älter']
    .map((name) => ({ name, items: CHATS.filter((c) => c.group === name) }))
    .filter((g) => g.items.length > 0);

  /**
   * Whether a chat is the open one.
   * @param id - Chat id.
   * @returns True for the active chat.
   */
  protected isActive(id: string): boolean {
    return id === 'c1' && this.state.screen() === 'chat';
  }
}

/** Settings content: model, summary language, account. */
@Component({
  selector: 'proto-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ChipComponent, ButtonComponent],
  template: `
    <section aria-labelledby="s-model" class="space-y-3">
      <h2 id="s-model" class="text-lg font-semibold">KI-Modell</h2>
      <p class="text-sm text-muted">Dieses Modell beantwortet deine Fragen und schreibt Zusammenfassungen.</p>
      @for (group of groups; track group.name) {
        <div role="radiogroup" [attr.aria-label]="group.name" class="space-y-2">
          <h3 class="flex items-center gap-2 pt-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <app-icon [name]="group.name === 'Cloud' ? 'cloud' : 'cpu'" [size]="14" />{{ group.name }}
          </h3>
          @for (m of group.models; track m.id) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="state.modelId() === m.id"
              class="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-card border bg-surface px-4 py-2 text-left transition-colors hover:bg-surface-muted"
              [class]="state.modelId() === m.id ? 'border-primary ring-1 ring-primary' : 'border-border'"
              (click)="pick(m)"
            >
              <span class="grid size-5 shrink-0 place-items-center rounded-full border-2" [class]="state.modelId() === m.id ? 'border-primary' : 'border-border-strong'">
                @if (state.modelId() === m.id) { <span class="size-2.5 rounded-full bg-primary"></span> }
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ m.name }}</span>
                <span class="block text-xs text-muted">{{ m.provider }}</span>
              </span>
              @if (m.verdict; as v) {
                <app-chip [tone]="v.tone" icon="alert-triangle">{{ v.label }}</app-chip>
              }
            </button>
          }
        </div>
      }
    </section>

    <section aria-labelledby="s-sum" class="mt-8 space-y-3">
      <h2 id="s-sum" class="text-lg font-semibold">Zusammenfassungen</h2>
      <div role="radiogroup" aria-label="Sprache der Zusammenfassung" class="inline-flex rounded-control border border-border-strong bg-surface p-1">
        <button type="button" role="radio" aria-checked="true" class="min-h-9 cursor-pointer rounded-md bg-primary px-4 text-sm font-medium text-on-primary pointer-coarse:min-h-11">Wie die Quelle</button>
        <button type="button" role="radio" aria-checked="false" class="min-h-9 cursor-pointer rounded-md px-4 text-sm font-medium text-foreground hover:bg-surface-muted pointer-coarse:min-h-11">Deutsch</button>
      </div>
    </section>

    <section aria-labelledby="s-acc" class="mt-8 space-y-3">
      <h2 id="s-acc" class="text-lg font-semibold">Konto</h2>
      <div class="max-w-sm space-y-1.5">
        <label for="s-name" class="text-sm font-medium">Anzeigename</label>
        <input id="s-name" value="Julian" class="min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-base pointer-coarse:min-h-11" />
      </div>
      <app-button variant="secondary" icon="settings">Passwort ändern</app-button>
    </section>
  `,
})
export class ProtoSettings {
  protected readonly state = inject(ProtoState);
  protected readonly groups = (['Lokal (Ollama)', 'Cloud'] as const).map((name) => ({
    name,
    models: MODELS.filter((m) => m.group === name),
  }));

  /**
   * Select a model; Ollama models with a warning ask first.
   * @param m - The model.
   */
  protected pick(m: ProtoModel): void {
    if (m.verdict) {
      this.state.pendingModelId.set(m.id);
      this.state.dialogOpen.set(true);
    } else {
      this.state.modelId.set(m.id);
    }
  }
}

/** Ollama hardware warning (native modal dialog: focus trap and Esc come from the browser). */
@Component({
  selector: 'proto-ollama-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ChipComponent, IconComponent],
  template: `<dialog
    #dlg
    class="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-overlay"
    aria-labelledby="ollama-title"
    (close)="state.dialogOpen.set(false)"
    (click)="onBackdrop($event)"
  >
    <div class="space-y-4 p-6">
      <div class="flex items-start gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning"><app-icon name="alert-triangle" /></span>
        <div>
          <h2 id="ollama-title" class="text-lg font-semibold">Keine GPU – Antworten sehr langsam</h2>
          <p class="mt-1 text-sm text-muted">{{ model().name }} läuft nur auf der CPU (geschätzt ca. 4 Wörter pro Sekunde).</p>
        </div>
      </div>
      <dl class="divide-y divide-border rounded-control border border-border text-sm">
        <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">Server-RAM</dt><dd>16 GB gesamt, 11,2 GB frei</dd></div>
        <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">GPU</dt><dd>keine GPU</dd></div>
        <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">Geschätzter Bedarf</dt><dd>5,9 GB</dd></div>
        <div class="flex items-center justify-between gap-4 px-3 py-2"><dt class="text-muted">Ergebnis</dt><dd><app-chip tone="warning" icon="alert-triangle">Nur CPU</app-chip></dd></div>
      </dl>
      <app-button variant="ghost" size="sm" icon="cpu">Geschwindigkeit testen</app-button>
    </div>
    <div class="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-muted px-6 py-4">
      <app-button variant="secondary" (click)="state.dialogOpen.set(false)">Abbrechen</app-button>
      <app-button variant="primary" (click)="accept()">Trotzdem verwenden</app-button>
    </div>
  </dialog>`,
})
export class ProtoOllamaDialog {
  protected readonly state = inject(ProtoState);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly model = computed(() => MODELS.find((m) => m.id === this.state.pendingModelId()) ?? MODELS[0]);

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.state.dialogOpen()) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  /** Accept the warning and use the model. */
  protected accept(): void {
    this.state.modelId.set(this.state.pendingModelId());
    this.state.dialogOpen.set(false);
  }

  /**
   * Close when the dark area around the dialog is clicked.
   * @param event - Click event.
   */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) this.state.dialogOpen.set(false);
  }
}

/** Class string for square icon-only buttons (44 px on touch screens). */
export const ICON_BTN =
  'grid size-10 shrink-0 cursor-pointer place-items-center rounded-control text-foreground transition-colors duration-150 hover:bg-surface-muted pointer-coarse:size-11';

/** Class string for the round citation marker inside answers. */
export const CITE_BTN =
  'mx-0.5 inline-grid h-6 min-w-6 cursor-pointer place-items-center rounded-full bg-primary-soft px-1.5 align-baseline text-xs font-semibold text-primary transition-opacity hover:opacity-80 pointer-coarse:h-8 pointer-coarse:min-w-8';

/** Class string for text inputs. */
export const INPUT =
  'min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-base placeholder:text-muted pointer-coarse:min-h-11';
