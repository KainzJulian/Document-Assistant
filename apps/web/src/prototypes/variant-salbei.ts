import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY, CITE, INPUT, ProtoChatList, ProtoComposer, ProtoSettings, ProtoStatus } from './proto-bits';
import { CITATIONS, DOCS, MESSAGES } from './proto-data';
import { ProtoScreen, ProtoState } from './proto-state';

/**
 * Variant 1, "Salbei": the familiar sidebar layout in fresh sage and green.
 * Text-only navigation, one column, sources tucked into an expandable list under each answer.
 */
@Component({
  selector: 'proto-salbei',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProtoStatus, ProtoComposer, ProtoChatList, ProtoSettings],
  host: { class: 'block h-dvh' },
  template: `
    <div class="flex h-full bg-background text-foreground">
      @if (state.drawerOpen()) {
        <div class="fixed inset-0 z-30 bg-overlay lg:hidden" (click)="state.drawerOpen.set(false)"></div>
      }

      <aside aria-label="Seitenleiste" class="fixed inset-y-0 left-0 z-40 flex w-70 flex-col border-r border-(--side-border) bg-(--side-bg) text-(--side-fg) transition-transform duration-200 lg:visible lg:static lg:translate-x-0" [class]="state.drawerOpen() ? 'translate-x-0' : '-translate-x-full invisible'">
        <div class="flex items-center justify-between px-5 pt-6 pb-4">
          <span class="text-lg font-semibold">Dokumenten-Assistent</span>
          <button type="button" class="cursor-pointer text-sm text-(--side-muted) lg:hidden" (click)="state.drawerOpen.set(false)">Schließen</button>
        </div>

        <div class="px-3"><button type="button" [class]="primary + ' w-full'" (click)="state.go('new')">Neuer Chat</button></div>

        <nav aria-label="Bereiche" class="mt-3 space-y-0.5 px-3">
          <button type="button" [class]="navClass('library')" (click)="state.go('library')">Bibliothek</button>
          <button type="button" [class]="navClass('settings')" (click)="state.go('settings')">Einstellungen</button>
        </nav>

        <div class="mx-3 mt-4">
          <label class="sr-only" for="sa-search">Chats durchsuchen</label>
          <input id="sa-search" type="search" placeholder="Chats durchsuchen" [class]="input" />
        </div>
        <div class="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2"><proto-chat-list /></div>

        <div class="flex items-center justify-between gap-2 border-t border-(--side-border) px-5 py-4 text-sm">
          <span class="font-medium">Julian</span>
          <span class="flex gap-3 text-(--side-muted)">
            <button type="button" class="cursor-pointer hover:text-(--side-fg)" (click)="state.toggleTheme()">{{ state.dark() ? 'Hell' : 'Dunkel' }}</button>
            <button type="button" class="cursor-pointer hover:text-(--side-fg)">Abmelden</button>
          </span>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 lg:hidden">
          <button type="button" [class]="quiet" (click)="state.drawerOpen.set(true)">Menü</button>
          <span class="font-semibold">Dokumenten-Assistent</span>
        </header>

        <main class="min-h-0 flex-1 overflow-y-auto">
          @switch (state.screen()) {
            @case ('new') {
              <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-6 px-5 py-10">
                <div>
                  <h1 class="text-3xl font-semibold tracking-tight">Frag deine Dokumente</h1>
                  <p class="mt-2 text-muted">Wähle aus, worüber du etwas wissen möchtest.</p>
                </div>
                <section aria-label="Dokumente wählen" class="rounded-(--r-card) border border-border bg-surface">
                  <div class="p-2">
                    <label class="sr-only" for="sa-doc">Dokumente suchen</label>
                    <input id="sa-doc" type="search" placeholder="Dokumente suchen" [class]="input" />
                  </div>
                  <ul class="max-h-60 divide-y divide-border overflow-y-auto border-t border-border">
                    @for (d of docs; track d.id) {
                      <li>
                        <label class="flex min-h-11 items-center gap-3 px-4 py-1.5" [class]="d.status === 'ready' ? 'cursor-pointer hover:bg-surface-muted' : 'opacity-60'">
                          <input type="checkbox" class="size-4 accent-primary" [checked]="state.isSelected(d.id)" [disabled]="d.status !== 'ready'" (change)="state.toggleDoc(d.id)" />
                          <span class="min-w-0 flex-1 truncate">{{ d.title }}</span>
                          @if (d.status === 'ready') { <span class="text-xs text-muted">{{ d.type }}</span> } @else { <proto-status [status]="d.status" /> }
                        </label>
                      </li>
                    }
                  </ul>
                </section>
                <proto-composer [hint]="selected().length + ' Dokumente ausgewählt'" />
              </div>
            }

            @case ('library') {
              <div class="mx-auto w-full max-w-3xl px-5 py-10">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h1 class="text-3xl font-semibold tracking-tight">Bibliothek</h1>
                  <div class="flex gap-2"><button type="button" [class]="secondary">URL importieren</button><button type="button" [class]="primary">Hochladen</button></div>
                </div>
                <p class="mt-2 text-sm text-muted">Dateien kannst du auch einfach hierher ziehen. PDF, Word, PowerPoint, Text, HTML und EPUB bis 50 MB.</p>
                <div class="mt-6"><label class="sr-only" for="sa-lib">Titel suchen</label><input id="sa-lib" type="search" placeholder="Titel suchen" [class]="input" /></div>
                <ul class="mt-4 divide-y divide-border border-y border-border">
                  @for (d of docs; track d.id) {
                    <li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-medium">{{ d.title }}</p>
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
              <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5">
                <header class="pt-8 pb-5">
                  <h1 class="text-2xl font-semibold tracking-tight">Kündigungsfrist Mietvertrag</h1>
                  <p class="mt-1 text-sm text-muted">Mietvertrag Wohnung Linz, Garantiebedingungen Geschirrspüler · llama3.1:8b · <span class="font-medium text-warning">Nur CPU</span></p>
                </header>
                <ol class="flex-1 space-y-7 pb-6">
                  @for (m of messages; track $index) {
                    @if (m.role === 'user') {
                      <li class="flex justify-end"><p class="max-w-[85%] rounded-(--r-card) bg-surface-muted px-4 py-2.5">{{ m.text }}</p></li>
                    } @else if (m.notFound) {
                      <li><p class="rounded-(--r-control) border border-border bg-surface px-4 py-3 text-muted">Dazu finde ich in den ausgewählten Dokumenten nichts.</p></li>
                    } @else {
                      <li class="space-y-3">
                        <p class="leading-relaxed">@for (p of m.parts; track $index) {@if (p.t === 'text') {<span>{{ p.v }}</span>} @else {<button type="button" [class]="cite" [attr.aria-label]="'Quelle ' + p.n" (click)="state.citation.set(p.n)">{{ p.n }}</button>}}</p>
                        <details open class="rounded-(--r-control) border border-border bg-surface">
                          <summary class="cursor-pointer px-4 py-2.5 text-sm font-medium text-primary">{{ citations.length }} Quellen</summary>
                          <ol class="divide-y divide-border border-t border-border">
                            @for (c of citations; track c.n) {
                              <li class="px-4 py-3 text-sm" [class]="state.citation() === c.n ? 'bg-primary-soft' : ''">
                                <p class="font-medium">{{ c.n }} · {{ c.docTitle }} <span class="font-normal text-muted">· {{ c.page }} · {{ c.section }}</span></p>
                                <p class="mt-1 text-muted">{{ c.text }}</p>
                              </li>
                            }
                          </ol>
                        </details>
                      </li>
                    }
                  }
                </ol>
                <div class="sticky bottom-0 bg-background pt-2 pb-5"><proto-composer hint="2 Dokumente ausgewählt" /></div>
              </div>
            }

            @case ('settings') {
              <div class="mx-auto w-full max-w-2xl px-5 py-10">
                <h1 class="mb-8 text-3xl font-semibold tracking-tight">Einstellungen</h1>
                <proto-settings />
              </div>
            }
          }
        </main>
      </div>
    </div>
  `,
})
export class VariantSalbei {
  protected readonly state = inject(ProtoState);
  protected readonly docs = DOCS;
  protected readonly messages = MESSAGES;
  protected readonly citations = CITATIONS;
  protected readonly primary = BTN_PRIMARY;
  protected readonly secondary = BTN_SECONDARY;
  protected readonly quiet = BTN_QUIET;
  protected readonly input = INPUT;
  protected readonly cite = CITE;
  protected readonly selected = computed(() => DOCS.filter((d) => this.state.selectedIds().includes(d.id)));

  /**
   * Class for a sidebar navigation button.
   * @param screen - Screen the button leads to.
   * @returns Tailwind classes, highlighted when that screen is open.
   */
  protected navClass(screen: ProtoScreen): string {
    return (
      'flex min-h-10 w-full cursor-pointer items-center rounded-(--r-control) px-3 text-sm transition-colors pointer-coarse:min-h-11 ' +
      (this.state.screen() === screen ? 'bg-(--side-active) font-medium text-(--side-active-fg)' : 'hover:bg-(--side-hover)')
    );
  }
}
