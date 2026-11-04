import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonComponent } from '../app/ui/atoms/button/button.component';
import { ChipComponent } from '../app/ui/atoms/chip/chip.component';
import { IconComponent } from '../app/ui/atoms/icon/icon.component';
import { CITATIONS, DOCS, MESSAGES, TYPE_ICON } from './proto-data';
import { CITE_BTN, ICON_BTN, INPUT, ProtoChatList, ProtoComposer, ProtoSettings, ProtoStatus } from './proto-bits';
import { ProtoScreen, ProtoState } from './proto-state';

/**
 * Variant 1, "Klassisch": the familiar chatbot layout. Full 280 px sidebar with chat list,
 * one centred column, sources open in a slide-over panel.
 */
@Component({
  selector: 'proto-classic',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ChipComponent, ButtonComponent, ProtoStatus, ProtoComposer, ProtoChatList, ProtoSettings],
  host: { class: 'block h-dvh' },
  template: `
    <div class="flex h-full bg-background text-foreground">
      @if (state.drawerOpen()) {
        <div class="fixed inset-0 z-30 bg-overlay lg:hidden" (click)="state.drawerOpen.set(false)"></div>
      }

      <aside
        aria-label="Seitenleiste"
        class="fixed inset-y-0 left-0 z-40 flex w-70 flex-col border-r border-border bg-surface transition-transform duration-200 lg:visible lg:static lg:translate-x-0"
        [class]="state.drawerOpen() ? 'translate-x-0' : '-translate-x-full invisible'"
      >
        <div class="flex items-center gap-2 px-4 pt-4 pb-3">
          <span class="grid size-9 place-items-center rounded-control bg-primary text-on-primary"><app-icon name="file-text" /></span>
          <span class="flex-1 font-semibold">Dokumenten-Assistent</span>
          <button type="button" [class]="iconBtn + ' lg:hidden'" aria-label="Menü schließen" (click)="state.drawerOpen.set(false)"><app-icon name="x" /></button>
        </div>

        <div class="space-y-1 px-3">
          <app-button variant="primary" icon="plus" [block]="true" (click)="state.go('new')">Neuer Chat</app-button>
          <button type="button" [class]="navClass('library')" (click)="state.go('library')">
            <app-icon name="library" />Bibliothek
          </button>
        </div>

        <div class="relative mx-3 mt-3">
          <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <label class="sr-only" for="v1-search">Chats durchsuchen</label>
          <input id="v1-search" type="search" placeholder="Chats durchsuchen" [class]="input + ' pl-9'" />
        </div>

        <div class="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2"><proto-chat-list /></div>

        <div class="space-y-1 border-t border-border p-3">
          <button type="button" [class]="navClass('settings')" (click)="state.go('settings')">
            <app-icon name="settings" />Einstellungen
          </button>
          <div class="flex items-center gap-2 px-1 pt-1">
            <span class="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary" aria-hidden="true">JK</span>
            <span class="min-w-0 flex-1 leading-tight"><span class="block truncate text-sm font-medium">Julian</span><span class="block text-xs text-muted">Admin</span></span>
            <button type="button" [class]="iconBtn" [attr.aria-label]="state.dark() ? 'Helles Design' : 'Dunkles Design'" (click)="state.toggleTheme()">
              <app-icon [name]="state.dark() ? 'sun' : 'moon'" />
            </button>
            <button type="button" [class]="iconBtn" aria-label="Abmelden"><app-icon name="log-out" /></button>
          </div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-1 border-b border-border bg-surface px-2 py-2 lg:hidden">
          <button type="button" [class]="iconBtn" aria-label="Menü öffnen" (click)="state.drawerOpen.set(true)"><app-icon name="menu" /></button>
          <span class="font-semibold">Dokumenten-Assistent</span>
        </header>

        <div class="flex min-h-0 flex-1">
          <main class="min-w-0 flex-1 overflow-y-auto">
            @switch (state.screen()) {
              @case ('new') {
                <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-5 px-4 py-8">
                  <div class="text-center">
                    <h1 class="text-3xl font-semibold tracking-tight">Frag deine Dokumente</h1>
                    <p class="mt-2 text-muted">Wähle Dokumente aus und stelle eine Frage. Jede Antwort nennt ihre Quellen.</p>
                  </div>

                  <section aria-labelledby="v1-pick" class="rounded-card border border-border bg-surface">
                    <div class="flex items-center gap-2 border-b border-border p-2">
                      <div class="relative flex-1">
                        <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                        <label class="sr-only" for="v1-docsearch">Dokumente suchen</label>
                        <input id="v1-docsearch" type="search" placeholder="Dokumente suchen" [class]="input + ' pl-9'" />
                      </div>
                      <app-button variant="ghost" size="sm">Alle auswählen</app-button>
                    </div>
                    <h2 id="v1-pick" class="sr-only">Dokumente auswählen</h2>
                    <ul class="max-h-64 divide-y divide-border overflow-y-auto">
                      @for (d of docs; track d.id) {
                        <li>
                          <label class="flex min-h-11 items-center gap-3 px-3 py-1.5" [class]="d.status === 'ready' ? 'cursor-pointer hover:bg-surface-muted' : 'opacity-60'">
                            <input type="checkbox" class="size-4 accent-primary" [checked]="state.isSelected(d.id)" [disabled]="d.status !== 'ready'" (change)="state.toggleDoc(d.id)" />
                            <app-icon [name]="typeIcon[d.type]" class="text-muted" />
                            <span class="min-w-0 flex-1 truncate text-sm">{{ d.title }}</span>
                            @if (d.status !== 'ready') { <proto-status [status]="d.status" /> }
                          </label>
                        </li>
                      }
                    </ul>
                  </section>

                  <div class="flex flex-wrap gap-2" aria-label="Ausgewählte Dokumente">
                    @for (d of selectedDocs(); track d.id) {
                      <app-chip icon="file-text" [removable]="true" [removeLabel]="d.title + ' entfernen'" (removed)="state.toggleDoc(d.id)">{{ d.title }}</app-chip>
                    }
                  </div>

                  <proto-composer [hint]="selectedDocs().length + ' Dokumente ausgewählt'" />
                </div>
              }

              @case ('library') {
                <div class="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 lg:px-8">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <h1 class="text-2xl font-semibold">Bibliothek</h1>
                    <div class="flex gap-2">
                      <app-button icon="link">URL importieren</app-button>
                      <app-button variant="primary" icon="upload">Hochladen</app-button>
                    </div>
                  </div>

                  <div class="rounded-card border-2 border-dashed border-border-strong p-6 text-center">
                    <app-icon name="upload" [size]="24" class="mx-auto text-muted" />
                    <p class="mt-2 font-medium">Dateien hierher ziehen oder auswählen</p>
                    <p class="text-sm text-muted">PDF, TXT, Markdown, DOCX, PPTX, HTML, EPUB – bis 50 MB</p>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <div class="relative min-w-48 flex-1">
                      <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                      <label class="sr-only" for="v1-lib">Titel suchen</label>
                      <input id="v1-lib" type="search" placeholder="Titel suchen" [class]="input + ' pl-9'" />
                    </div>
                    <div role="radiogroup" aria-label="Filter" class="inline-flex rounded-control border border-border-strong bg-surface p-1">
                      @for (f of filters; track f; let i = $index) {
                        <button type="button" role="radio" [attr.aria-checked]="i === 0" class="min-h-9 cursor-pointer rounded-md px-3 text-sm font-medium pointer-coarse:min-h-11" [class]="i === 0 ? 'bg-primary text-on-primary' : 'text-foreground hover:bg-surface-muted'">{{ f }}</button>
                      }
                    </div>
                  </div>

                  <ul class="divide-y divide-border rounded-card border border-border bg-surface">
                    @for (d of docs; track d.id) {
                      <li class="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span class="grid size-10 shrink-0 place-items-center rounded-control bg-surface-muted text-muted"><app-icon [name]="typeIcon[d.type]" /></span>
                        <span class="min-w-0 flex-1">
                          <span class="block truncate font-medium">{{ d.title }}</span>
                          <span class="block text-sm text-muted">{{ d.type }} · {{ d.meta }} · {{ d.size }} · {{ d.added }}</span>
                          @if (d.error) { <span class="mt-0.5 block text-sm text-danger">{{ d.error }}</span> }
                        </span>
                        @if (d.shared) { <app-chip tone="neutral" icon="users">Geteilt</app-chip> }
                        <proto-status [status]="d.status" />
                        @if (d.status === 'failed') { <app-button size="sm" icon="refresh">Erneut versuchen</app-button> }
                        <button type="button" [class]="iconBtn" [attr.aria-label]="'Weitere Aktionen für ' + d.title"><app-icon name="more" /></button>
                      </li>
                    }
                  </ul>
                </div>
              }

              @case ('chat') {
                <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4">
                  <header class="sticky top-0 z-10 space-y-2 border-b border-border bg-background py-3">
                    <h1 class="text-lg font-semibold">Kündigungsfrist Mietvertrag</h1>
                    <div class="flex flex-wrap items-center gap-2">
                      <app-chip icon="file-text">Mietvertrag Wohnung Linz</app-chip>
                      <app-chip icon="file-text">Garantiebedingungen Geschirrspüler</app-chip>
                      <app-chip icon="cpu">llama3.1:8b</app-chip>
                      <app-chip tone="warning" icon="alert-triangle">Nur CPU</app-chip>
                    </div>
                  </header>

                  <ol class="flex-1 space-y-6 py-6">
                    @for (m of messages; track $index) {
                      @if (m.role === 'user') {
                        <li class="flex justify-end"><p class="max-w-[85%] rounded-2xl rounded-br-md bg-surface-muted px-4 py-2.5">{{ m.text }}</p></li>
                      } @else {
                        <li class="flex gap-3">
                          <span class="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-on-primary"><app-icon name="file-text" [size]="16" /></span>
                          <div class="min-w-0 flex-1 space-y-2">
                            @if (m.notFound) {
                              <p class="flex items-start gap-2 rounded-control border border-border bg-surface px-3 py-2 text-muted"><app-icon name="info" [size]="18" class="mt-0.5" />Dazu finde ich in den ausgewählten Dokumenten nichts.</p>
                            } @else {
                              <p class="leading-relaxed">
                                @for (p of m.parts; track $index) {
                                  @if (p.t === 'text') {<span>{{ p.v }}</span>} @else {
                                    <button type="button" [class]="citeBtn" [attr.aria-label]="'Quelle ' + p.n + ' öffnen'" [attr.aria-pressed]="state.citation() === p.n" (click)="state.citation.set(p.n)">{{ p.n }}</button>
                                  }
                                }
                              </p>
                              <div class="flex gap-1">
                                <button type="button" [class]="iconBtn" aria-label="Kopieren"><app-icon name="copy" [size]="16" /></button>
                                <button type="button" [class]="iconBtn" aria-label="Neu generieren"><app-icon name="refresh" [size]="16" /></button>
                              </div>
                            }
                          </div>
                        </li>
                      }
                    }
                  </ol>

                  <div class="sticky bottom-0 bg-background pt-2 pb-4"><proto-composer hint="Antworten nutzen nur die 2 ausgewählten Dokumente." /></div>
                </div>
              }

              @case ('settings') {
                <div class="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8">
                  <h1 class="mb-6 text-2xl font-semibold">Einstellungen</h1>
                  <proto-settings />
                </div>
              }
            }
          </main>

          @if (state.screen() === 'chat' && citation(); as c) {
            <aside aria-label="Quelle" class="fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-card border border-border bg-surface p-5 shadow-xl lg:static lg:max-h-none lg:w-96 lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-xs font-semibold tracking-wide text-muted uppercase">Quelle {{ c.n }}</p>
                  <h2 class="font-semibold">{{ c.docTitle }}</h2>
                  <p class="text-sm text-muted">{{ c.page }} · {{ c.section }}</p>
                </div>
                <button type="button" [class]="iconBtn" aria-label="Quelle schließen" (click)="state.citation.set(null)"><app-icon name="x" /></button>
              </div>
              <blockquote class="mt-4 border-l-4 border-primary bg-primary-soft/50 py-3 pr-3 pl-4 font-serif leading-relaxed">{{ c.text }}</blockquote>
              <div class="mt-4"><app-button icon="file-text" [block]="true">Dokument öffnen</app-button></div>
            </aside>
          }
        </div>
      </div>
    </div>
  `,
})
export class VariantClassic {
  protected readonly state = inject(ProtoState);
  protected readonly docs = DOCS;
  protected readonly messages = MESSAGES;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly iconBtn = ICON_BTN;
  protected readonly citeBtn = CITE_BTN;
  protected readonly input = INPUT;
  protected readonly filters = ['Alle', 'Bereit', 'In Arbeit', 'Fehler'];
  protected readonly selectedDocs = computed(() => DOCS.filter((d) => this.state.selectedIds().includes(d.id)));
  protected readonly citation = computed(() => CITATIONS.find((c) => c.n === this.state.citation()));

  /**
   * Class for a sidebar navigation button.
   * @param screen - Screen the button leads to.
   * @returns Tailwind classes, highlighted when that screen is open.
   */
  protected navClass(screen: ProtoScreen): string {
    const base = 'flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-sm transition-colors duration-150 pointer-coarse:min-h-11 ';
    return base + (this.state.screen() === screen ? 'bg-primary-soft font-medium text-primary' : 'text-foreground hover:bg-surface-muted');
  }
}
