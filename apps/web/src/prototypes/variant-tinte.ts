import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY, CITE, INPUT, ProtoChatList, ProtoComposer, ProtoSettings, ProtoStatus } from './proto-bits';
import { CITATIONS, DOCS, MESSAGES } from './proto-data';
import { ProtoScreen, ProtoState } from './proto-state';

/**
 * Variant 2, "Tinte": no sidebar. A slim top bar with text navigation, history in a slide-in
 * panel, warm paper tones, sharp corners and serif headings.
 */
@Component({
  selector: 'proto-tinte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProtoStatus, ProtoComposer, ProtoChatList, ProtoSettings],
  host: { class: 'block h-dvh' },
  template: `
    <div class="flex h-full flex-col bg-background text-foreground">
      <header class="border-b border-border bg-surface">
        <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-1 px-5 pt-3">
          <span class="font-(family-name:--font-display) text-xl font-semibold">Dokumenten-Assistent</span>
          <span class="flex-1"></span>
          <div class="flex items-center gap-1 text-sm">
            <button type="button" [class]="quiet" (click)="state.historyOpen.set(true)">Verlauf</button>
            <button type="button" [class]="quiet" (click)="state.toggleTheme()">{{ state.dark() ? 'Hell' : 'Dunkel' }}</button>
            <span class="px-2 font-medium">Julian</span>
          </div>
        </div>
        <nav aria-label="Bereiche" class="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3">
          @for (n of nav; track n.screen) {
            <button type="button" [class]="navClass(n.screen)" [attr.aria-current]="state.screen() === n.screen ? 'page' : null" (click)="state.go(n.screen)">{{ n.label }}</button>
          }
        </nav>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto">
        @switch (state.screen()) {
          @case ('new') {
            <div class="mx-auto w-full max-w-3xl px-5 py-12">
              <h1 class="font-(family-name:--font-display) text-4xl leading-tight font-semibold tracking-tight lg:text-5xl">Frag deine Dokumente.</h1>
              <p class="mt-3 max-w-prose text-lg text-muted">Wähle ein paar Dokumente aus, dann stell deine Frage. Jede Antwort sagt dir, woher sie kommt.</p>
              <h2 class="mt-10 mb-2 text-sm font-medium text-muted">Dokumente ({{ selected().length }} ausgewählt)</h2>
              <ul class="divide-y divide-border border-y border-border">
                @for (d of docs; track d.id) {
                  <li>
                    <label class="flex min-h-11 items-center gap-3 py-1.5" [class]="d.status === 'ready' ? 'cursor-pointer hover:bg-surface-muted' : 'opacity-60'">
                      <input type="checkbox" class="size-4 accent-primary" [checked]="state.isSelected(d.id)" [disabled]="d.status !== 'ready'" (change)="state.toggleDoc(d.id)" />
                      <span class="min-w-0 flex-1 truncate font-(family-name:--font-display) text-lg">{{ d.title }}</span>
                      @if (d.status === 'ready') { <span class="text-sm text-muted">{{ d.meta }}</span> } @else { <proto-status [status]="d.status" /> }
                    </label>
                  </li>
                }
              </ul>
              <div class="mt-8"><proto-composer hint="Enter sendet, Umschalt+Enter neue Zeile" /></div>
            </div>
          }

          @case ('library') {
            <div class="mx-auto w-full max-w-3xl px-5 py-12">
              <div class="flex flex-wrap items-end justify-between gap-3">
                <h1 class="font-(family-name:--font-display) text-4xl font-semibold tracking-tight">Bibliothek</h1>
                <div class="flex gap-2"><button type="button" [class]="secondary">URL importieren</button><button type="button" [class]="primary">Hochladen</button></div>
              </div>
              <div class="mt-6"><label class="sr-only" for="ti-lib">Titel suchen</label><input id="ti-lib" type="search" placeholder="Titel suchen" [class]="input" /></div>
              <ul class="mt-6 divide-y divide-border border-y border-border">
                @for (d of docs; track d.id) {
                  <li class="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
                    <div class="min-w-0 flex-1">
                      <p class="font-(family-name:--font-display) text-lg leading-snug">{{ d.title }}</p>
                      <p class="text-sm text-muted">{{ d.type }} · {{ d.meta }} · {{ d.added }}@if (d.shared) { · Geteilt }</p>
                      @if (d.error) { <p class="text-sm text-danger">{{ d.error }}</p> }
                    </div>
                    <proto-status [status]="d.status" />
                    @if (d.status === 'failed') { <button type="button" [class]="quiet">Erneut versuchen</button> }
                  </li>
                }
              </ul>
            </div>
          }

          @case ('chat') {
            <div class="mx-auto flex min-h-full w-full max-w-prose flex-col px-5">
              <header class="pt-10 pb-6">
                <h1 class="font-(family-name:--font-display) text-3xl leading-tight font-semibold tracking-tight">Kündigungsfrist Mietvertrag</h1>
                <p class="mt-2 text-sm text-muted">Mietvertrag Wohnung Linz, Garantiebedingungen Geschirrspüler · llama3.1:8b · <span class="font-medium text-warning">Nur CPU</span></p>
              </header>
              <ol class="flex-1 space-y-10 pb-8">
                @for (m of messages; track $index) {
                  @if (m.role === 'user') {
                    <li><p class="border-l-2 border-primary pl-4 font-(family-name:--font-display) text-xl leading-snug font-semibold">{{ m.text }}</p></li>
                  } @else if (m.notFound) {
                    <li><p class="text-lg text-muted italic">Dazu finde ich in den ausgewählten Dokumenten nichts.</p></li>
                  } @else {
                    <li class="space-y-4">
                      <p class="text-lg leading-8">@for (p of m.parts; track $index) {@if (p.t === 'text') {<span>{{ p.v }}</span>} @else {<sup><button type="button" class="cursor-pointer px-0.5 text-xs font-bold text-primary underline underline-offset-2 pointer-coarse:min-w-8 pointer-coarse:py-2" [attr.aria-label]="'Quelle ' + p.n" (click)="state.citation.set(p.n)">{{ p.n }}</button></sup>}}</p>
                      <ol class="space-y-3 border-t border-border pt-4">
                        @for (c of citations; track c.n) {
                          <li class="border-l-2 pl-3 text-sm" [class]="state.citation() === c.n ? 'border-primary' : 'border-border-strong'">
                            <p class="font-medium">{{ c.n }} · {{ c.docTitle }} <span class="font-normal text-muted">· {{ c.page }} · {{ c.section }}</span></p>
                            <p class="mt-0.5 font-(family-name:--font-display) text-base text-muted">{{ c.text }}</p>
                          </li>
                        }
                      </ol>
                    </li>
                  }
                }
              </ol>
              <div class="sticky bottom-0 bg-background pt-2 pb-5"><proto-composer hint="2 Dokumente ausgewählt" /></div>
            </div>
          }

          @case ('settings') {
            <div class="mx-auto w-full max-w-2xl px-5 py-12">
              <h1 class="mb-8 font-(family-name:--font-display) text-4xl font-semibold tracking-tight">Einstellungen</h1>
              <proto-settings />
            </div>
          }
        }
      </main>

      @if (state.historyOpen()) {
        <div class="fixed inset-0 z-30 bg-overlay" (click)="state.historyOpen.set(false)"></div>
        <aside aria-label="Verlauf" class="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[90vw] flex-col border-l border-border bg-surface shadow-xl">
          <div class="flex items-center justify-between px-5 py-4"><h2 class="font-(family-name:--font-display) text-xl font-semibold">Verlauf</h2><button type="button" [class]="quiet" (click)="state.historyOpen.set(false)">Schließen</button></div>
          <div class="px-4"><label class="sr-only" for="ti-search">Chats durchsuchen</label><input id="ti-search" type="search" placeholder="Chats durchsuchen" [class]="input" /></div>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4"><proto-chat-list /></div>
        </aside>
      }
    </div>
  `,
})
export class VariantTinte {
  protected readonly state = inject(ProtoState);
  protected readonly docs = DOCS;
  protected readonly messages = MESSAGES;
  protected readonly citations = CITATIONS;
  protected readonly primary = BTN_PRIMARY;
  protected readonly secondary = BTN_SECONDARY;
  protected readonly quiet = BTN_QUIET;
  protected readonly input = INPUT;
  protected readonly cite = CITE;
  protected readonly nav: { screen: ProtoScreen; label: string }[] = [
    { screen: 'new', label: 'Neuer Chat' },
    { screen: 'library', label: 'Bibliothek' },
    { screen: 'chat', label: 'Chat' },
    { screen: 'settings', label: 'Einstellungen' },
  ];
  protected readonly selected = computed(() => DOCS.filter((d) => this.state.selectedIds().includes(d.id)));

  /**
   * Class for a top navigation button.
   * @param screen - Screen the button leads to.
   * @returns Tailwind classes with an underline when active.
   */
  protected navClass(screen: ProtoScreen): string {
    return (
      'min-h-10 shrink-0 cursor-pointer border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:min-h-11 ' +
      (this.state.screen() === screen ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground')
    );
  }
}
