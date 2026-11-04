import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY, INPUT, ProtoChatList, ProtoComposer, ProtoSettings, ProtoStatus } from './proto-bits';
import { CITATIONS, DOCS, MESSAGES } from './proto-data';
import { ProtoScreen, ProtoState } from './proto-state';

/**
 * Variant 3, "Lagune": deep teal sidebar against bright content, big rounded cards, documents
 * chosen as pills, answers as cards with source pills that open the passage in place.
 */
@Component({
  selector: 'proto-lagune',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProtoStatus, ProtoComposer, ProtoChatList, ProtoSettings],
  host: { class: 'block h-dvh' },
  template: `
    <div class="flex h-full bg-background text-foreground">
      @if (state.drawerOpen()) {
        <div class="fixed inset-0 z-30 bg-overlay lg:hidden" (click)="state.drawerOpen.set(false)"></div>
      }

      <aside aria-label="Seitenleiste" class="fixed inset-y-0 left-0 z-40 flex w-70 flex-col bg-(--side-bg) text-(--side-fg) transition-transform duration-200 lg:visible lg:static lg:translate-x-0" [class]="state.drawerOpen() ? 'translate-x-0' : '-translate-x-full invisible'">
        <div class="flex items-center justify-between px-6 pt-7 pb-5">
          <span class="text-lg leading-tight font-bold">Dokumenten-<br />Assistent</span>
          <button type="button" class="cursor-pointer text-sm text-(--side-muted) lg:hidden" (click)="state.drawerOpen.set(false)">Schließen</button>
        </div>

        <div class="px-4"><button type="button" class="min-h-11 w-full cursor-pointer rounded-(--r-control) bg-(--side-fg) px-4 text-sm font-semibold text-(--side-bg) transition-opacity hover:opacity-90" (click)="state.go('new')">Neuer Chat</button></div>

        <nav aria-label="Bereiche" class="mt-3 space-y-0.5 px-4">
          <button type="button" [class]="navClass('library')" (click)="state.go('library')">Bibliothek</button>
          <button type="button" [class]="navClass('settings')" (click)="state.go('settings')">Einstellungen</button>
        </nav>

        <div class="mx-4 mt-4">
          <label class="sr-only" for="la-search">Chats durchsuchen</label>
          <input id="la-search" type="search" placeholder="Chats durchsuchen" class="min-h-10 w-full rounded-(--r-control) border border-(--side-border) bg-transparent px-3 text-sm text-(--side-fg) placeholder:text-(--side-muted) pointer-coarse:min-h-11" />
        </div>
        <div class="mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-2"><proto-chat-list /></div>

        <div class="flex items-center justify-between gap-2 border-t border-(--side-border) px-6 py-4 text-sm">
          <span class="font-medium">Julian</span>
          <span class="flex gap-3 text-(--side-muted)">
            <button type="button" class="cursor-pointer hover:text-(--side-fg)" (click)="state.toggleTheme()">{{ state.dark() ? 'Hell' : 'Dunkel' }}</button>
            <button type="button" class="cursor-pointer hover:text-(--side-fg)">Abmelden</button>
          </span>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-3 bg-(--side-bg) px-4 py-2 text-(--side-fg) lg:hidden">
          <button type="button" class="min-h-10 cursor-pointer px-2 text-sm font-medium" (click)="state.drawerOpen.set(true)">Menü</button>
          <span class="font-bold">Dokumenten-Assistent</span>
        </header>

        <main class="min-h-0 flex-1 overflow-y-auto">
          @switch (state.screen()) {
            @case ('new') {
              <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-6 px-5 py-10">
                <h1 class="text-4xl leading-tight font-bold tracking-tight">Worüber möchtest du mehr wissen?</h1>
                <section aria-label="Dokumente wählen" class="space-y-4 rounded-(--r-card) bg-surface p-6 shadow-md">
                  <div>
                    <h2 class="mb-3 text-sm font-semibold text-muted">Dokumente · {{ selected().length }} gewählt</h2>
                    <ul class="flex flex-wrap gap-2">
                      @for (d of readyDocs; track d.id) {
                        <li>
                          <button type="button" role="checkbox" [attr.aria-checked]="state.isSelected(d.id)" class="min-h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors pointer-coarse:min-h-11" [class]="state.isSelected(d.id) ? 'border-primary bg-primary text-on-primary' : 'border-border-strong bg-surface hover:bg-surface-muted'" (click)="state.toggleDoc(d.id)">{{ d.title }}</button>
                        </li>
                      }
                    </ul>
                    <p class="mt-3 text-sm text-muted">{{ busyDocs }} weitere Dokumente werden noch verarbeitet.</p>
                  </div>
                  <proto-composer hint="Antworten nutzen nur die gewählten Dokumente." />
                </section>
              </div>
            }

            @case ('library') {
              <div class="mx-auto w-full max-w-5xl px-5 py-10">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h1 class="text-4xl font-bold tracking-tight">Bibliothek</h1>
                  <div class="flex gap-2"><button type="button" [class]="secondary">URL importieren</button><button type="button" [class]="primary">Hochladen</button></div>
                </div>
                <ul class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  @for (d of docs; track d.id) {
                    <li class="flex flex-col gap-3 rounded-(--r-card) bg-surface p-5 shadow-sm">
                      <div class="flex-1">
                        <p class="text-lg leading-snug font-semibold">{{ d.title }}</p>
                        <p class="mt-1 text-sm text-muted">{{ d.type }} · {{ d.meta }}@if (d.shared) { · Geteilt }</p>
                        @if (d.error) { <p class="mt-2 text-sm text-danger">{{ d.error }}</p> }
                      </div>
                      <div class="flex items-center justify-between gap-2">
                        <proto-status [status]="d.status" />
                        @if (d.status === 'failed') { <button type="button" [class]="quiet">Erneut versuchen</button> }
                        @else if (d.status === 'ready') { <button type="button" [class]="quiet" (click)="state.go('chat')">Chat starten</button> }
                      </div>
                    </li>
                  }
                </ul>
              </div>
            }

            @case ('chat') {
              <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5">
                <header class="pt-8 pb-5">
                  <h1 class="text-3xl font-bold tracking-tight">Kündigungsfrist Mietvertrag</h1>
                  <p class="mt-1 text-sm text-muted">Mietvertrag Wohnung Linz, Garantiebedingungen Geschirrspüler · llama3.1:8b · <span class="font-semibold text-warning">Nur CPU</span></p>
                </header>
                <ol class="flex-1 space-y-5 pb-6">
                  @for (m of messages; track $index) {
                    @if (m.role === 'user') {
                      <li class="flex justify-end"><p class="max-w-[85%] rounded-(--r-card) rounded-br-md bg-primary px-5 py-3 text-on-primary">{{ m.text }}</p></li>
                    } @else if (m.notFound) {
                      <li><p class="rounded-(--r-card) bg-surface px-5 py-4 text-muted shadow-sm">Dazu finde ich in den ausgewählten Dokumenten nichts.</p></li>
                    } @else {
                      <li class="space-y-4 rounded-(--r-card) bg-surface p-5 shadow-sm">
                        <p class="text-lg leading-relaxed">@for (p of m.parts; track $index) {@if (p.t === 'text') {<span>{{ p.v }}</span>} @else {<span class="ml-0.5 inline-block min-w-5 rounded-full bg-primary-soft px-1.5 text-center text-xs font-bold text-primary">{{ p.n }}</span>}}</p>
                        <div class="flex flex-wrap gap-2" aria-label="Quellen">
                          @for (c of citations; track c.n) {
                            <button type="button" class="min-h-9 cursor-pointer rounded-full border px-3 text-sm transition-colors pointer-coarse:min-h-11" [class]="state.citation() === c.n ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border-strong hover:bg-surface-muted'" [attr.aria-expanded]="state.citation() === c.n" (click)="state.citation.set(state.citation() === c.n ? null : c.n)">{{ c.n }} · {{ c.page }} · {{ c.section }}</button>
                          }
                        </div>
                        @if (activeCitation(); as c) {
                          <blockquote class="rounded-(--r-control) bg-surface-muted p-4 text-base leading-relaxed">
                            <p class="mb-1 text-sm font-semibold">{{ c.docTitle }}</p>
                            {{ c.text }}
                          </blockquote>
                        }
                      </li>
                    }
                  }
                </ol>
                <div class="sticky bottom-0 bg-background pt-2 pb-5"><proto-composer hint="2 Dokumente gewählt" /></div>
              </div>
            }

            @case ('settings') {
              <div class="mx-auto w-full max-w-2xl px-5 py-10">
                <h1 class="mb-6 text-4xl font-bold tracking-tight">Einstellungen</h1>
                <div class="rounded-(--r-card) bg-surface p-6 shadow-sm"><proto-settings /></div>
              </div>
            }
          }
        </main>
      </div>
    </div>
  `,
})
export class VariantLagune {
  protected readonly state = inject(ProtoState);
  protected readonly docs = DOCS;
  protected readonly readyDocs = DOCS.filter((d) => d.status === 'ready');
  protected readonly busyDocs = DOCS.filter((d) => d.status !== 'ready').length;
  protected readonly messages = MESSAGES;
  protected readonly citations = CITATIONS;
  protected readonly primary = BTN_PRIMARY;
  protected readonly secondary = BTN_SECONDARY;
  protected readonly quiet = BTN_QUIET;
  protected readonly input = INPUT;
  protected readonly selected = computed(() => DOCS.filter((d) => this.state.selectedIds().includes(d.id)));
  protected readonly activeCitation = computed(() => CITATIONS.find((c) => c.n === this.state.citation()));

  /**
   * Class for a sidebar navigation button.
   * @param screen - Screen the button leads to.
   * @returns Tailwind classes, highlighted when that screen is open.
   */
  protected navClass(screen: ProtoScreen): string {
    return (
      'flex min-h-10 w-full cursor-pointer items-center rounded-(--r-control) px-3 text-sm transition-colors pointer-coarse:min-h-11 ' +
      (this.state.screen() === screen ? 'bg-(--side-active) font-semibold text-(--side-active-fg)' : 'hover:bg-(--side-hover)')
    );
  }
}
