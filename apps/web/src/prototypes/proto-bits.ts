import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, viewChild } from '@angular/core';
import { CHATS, DocStatus, MODELS, ProtoModel, STATUS } from './proto-data';
import { ProtoState } from './proto-state';

/*
 * Shared building blocks. No icons on purpose: text labels and colour dots only.
 * Colours, radii and fonts come from the variant's tokens (themes.css).
 */

const BTN =
  'inline-flex min-h-10 cursor-pointer items-center justify-center rounded-(--r-control) px-4 text-sm font-medium transition-colors duration-150 pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-50 ';

/** Filled main action. */
export const BTN_PRIMARY = BTN + 'bg-primary text-on-primary hover:opacity-90';
/** Outlined secondary action. */
export const BTN_SECONDARY = BTN + 'border border-border-strong bg-surface text-foreground hover:bg-surface-muted';
/** Text-only action. */
export const BTN_QUIET = BTN + 'text-foreground hover:bg-surface-muted';
/** Text input. */
export const INPUT =
  'min-h-10 w-full rounded-(--r-control) border border-border-strong bg-surface px-3 text-base placeholder:text-muted pointer-coarse:min-h-11';
/** Round citation number inside an answer. */
export const CITE =
  'ml-0.5 inline-block min-w-5 cursor-pointer rounded-full bg-primary-soft px-1.5 text-center align-baseline text-xs font-semibold text-primary hover:opacity-80 pointer-coarse:min-w-8 pointer-coarse:py-1';

const TONE_TEXT: Record<string, string> = {
  neutral: 'text-muted',
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
const TONE_DOT: Record<string, string> = {
  neutral: 'bg-border-strong',
  info: 'bg-primary animate-pulse',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** Document status as a coloured dot plus text. */
@Component({
  selector: 'proto-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="inline-flex items-center gap-1.5 text-sm font-medium" [class]="text()">
    <span class="size-2 rounded-full" [class]="dot()"></span>{{ s().label }}
  </span>`,
})
export class ProtoStatus {
  /** Status to show. */
  readonly status = input.required<DocStatus>();
  protected readonly s = computed(() => STATUS[this.status()]);
  protected readonly text = computed(() => TONE_TEXT[this.s().tone]);
  protected readonly dot = computed(() => TONE_DOT[this.s().tone]);
}

/** Question input with a plain "Senden" button. */
@Component({
  selector: 'proto-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<form
    class="rounded-(--r-card) border border-border-strong bg-surface p-2 shadow-sm focus-within:outline-2 focus-within:outline-primary"
    (submit)="$event.preventDefault()"
  >
    <label class="sr-only" for="proto-msg">Frage an die Dokumente</label>
    <textarea
      id="proto-msg"
      rows="2"
      class="w-full resize-none bg-transparent p-2 text-base outline-none placeholder:text-muted"
      placeholder="Frage zu deinen Dokumenten …"
    ></textarea>
    <div class="flex items-center justify-between gap-3 px-1 pb-1">
      <span class="truncate text-xs text-muted">{{ hint() }}</span>
      <button type="submit" [class]="send">Senden</button>
    </div>
  </form>`,
})
export class ProtoComposer {
  /** Small text next to the button. */
  readonly hint = input('Antworten nutzen nur die ausgewählten Dokumente.');
  protected readonly send = BTN_PRIMARY;
}

/** Chats grouped by date. Uses the sidebar tokens so it fits light and dark sidebars. */
@Component({
  selector: 'proto-chat-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav aria-label="Chats">
    @for (g of groups; track g.name) {
      <h3 class="px-3 pt-4 pb-1 text-xs font-medium text-(--side-muted)">{{ g.name }}</h3>
      <ul>
        @for (c of g.items; track c.id) {
          <li>
            <button
              type="button"
              class="flex min-h-9 w-full cursor-pointer items-center rounded-(--r-control) px-3 text-left text-sm transition-colors pointer-coarse:min-h-11"
              [class]="isActive(c.id) ? 'bg-(--side-active) font-medium text-(--side-active-fg)' : 'text-(--side-fg) hover:bg-(--side-hover)'"
              [attr.aria-current]="isActive(c.id) ? 'page' : null"
              (click)="state.go('chat'); state.historyOpen.set(false)"
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
  template: `
    <section aria-labelledby="s-model" class="space-y-3">
      <h2 id="s-model" class="font-(family-name:--font-display) text-xl font-semibold">KI-Modell</h2>
      <p class="text-sm text-muted">Dieses Modell beantwortet deine Fragen und schreibt Zusammenfassungen.</p>
      @for (group of groups; track group.name) {
        <div role="radiogroup" [attr.aria-label]="group.name" class="space-y-2">
          <h3 class="pt-3 text-sm font-medium text-muted">{{ group.name }}</h3>
          @for (m of group.models; track m.id) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="state.modelId() === m.id"
              class="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-(--r-card) border bg-surface px-4 py-2 text-left transition-colors hover:bg-surface-muted"
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
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" [class]="v.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'">{{ v.label }}</span>
              }
            </button>
          }
        </div>
      }
    </section>

    <section aria-labelledby="s-sum" class="mt-10 space-y-3">
      <h2 id="s-sum" class="font-(family-name:--font-display) text-xl font-semibold">Zusammenfassungen</h2>
      <div role="radiogroup" aria-label="Sprache der Zusammenfassung" class="inline-flex rounded-(--r-control) border border-border-strong bg-surface p-1">
        <button type="button" role="radio" aria-checked="true" class="min-h-9 cursor-pointer rounded-(--r-control) bg-primary px-4 text-sm font-medium text-on-primary pointer-coarse:min-h-11">Wie die Quelle</button>
        <button type="button" role="radio" aria-checked="false" class="min-h-9 cursor-pointer rounded-(--r-control) px-4 text-sm font-medium hover:bg-surface-muted pointer-coarse:min-h-11">Deutsch</button>
      </div>
    </section>

    <section aria-labelledby="s-acc" class="mt-10 space-y-3">
      <h2 id="s-acc" class="font-(family-name:--font-display) text-xl font-semibold">Konto</h2>
      <div class="max-w-sm space-y-1.5">
        <label for="s-name" class="text-sm font-medium">Anzeigename</label>
        <input id="s-name" value="Julian" [class]="input" />
      </div>
      <button type="button" [class]="secondary">Passwort ändern</button>
    </section>
  `,
})
export class ProtoSettings {
  protected readonly state = inject(ProtoState);
  protected readonly input = INPUT;
  protected readonly secondary = BTN_SECONDARY;
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
  template: `<dialog
    #dlg
    class="m-auto w-[calc(100%-2rem)] max-w-md rounded-(--r-card) border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-overlay"
    aria-labelledby="ollama-title"
    (close)="state.dialogOpen.set(false)"
    (click)="onBackdrop($event)"
  >
    <div class="space-y-4 p-6">
      <div>
        <p class="mb-1 text-sm font-medium text-warning">Nur CPU</p>
        <h2 id="ollama-title" class="font-(family-name:--font-display) text-xl leading-snug font-semibold">Keine GPU – Antworten sehr langsam</h2>
        <p class="mt-2 text-sm text-muted">{{ model().name }} läuft nur auf der CPU, geschätzt etwa 4 Wörter pro Sekunde.</p>
      </div>
      <dl class="divide-y divide-border rounded-(--r-control) border border-border text-sm">
        <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">Server-RAM</dt><dd>16 GB gesamt, 11,2 GB frei</dd></div>
        <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">GPU</dt><dd>keine</dd></div>
        <div class="flex justify-between gap-4 px-3 py-2"><dt class="text-muted">Geschätzter Bedarf</dt><dd>5,9 GB</dd></div>
      </dl>
      <button type="button" [class]="quiet">Geschwindigkeit testen</button>
    </div>
    <div class="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-muted px-6 py-4">
      <button type="button" [class]="secondary" (click)="state.dialogOpen.set(false)">Abbrechen</button>
      <button type="button" [class]="primary" (click)="accept()">Trotzdem verwenden</button>
    </div>
  </dialog>`,
})
export class ProtoOllamaDialog {
  protected readonly state = inject(ProtoState);
  protected readonly primary = BTN_PRIMARY;
  protected readonly secondary = BTN_SECONDARY;
  protected readonly quiet = BTN_QUIET;
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
