import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonComponent } from '../app/ui/atoms/button/button.component';
import { ChipComponent } from '../app/ui/atoms/chip/chip.component';
import { IconComponent, IconName } from '../app/ui/atoms/icon/icon.component';
import { CITATIONS, DOCS, MESSAGES, TYPE_ICON } from './proto-data';
import { CITE_BTN, ICON_BTN, INPUT, ProtoChatList, ProtoComposer, ProtoSettings, ProtoStatus } from './proto-bits';
import { ProtoScreen, ProtoState } from './proto-state';

/**
 * Variant 2, "Arbeitsbereich": dense work surface. Icon rail plus a context pane whose content
 * follows the section, a table-based library, and a source panel that stays docked in chat.
 */
@Component({
  selector: 'proto-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ChipComponent, ButtonComponent, ProtoStatus, ProtoComposer, ProtoChatList, ProtoSettings],
  host: { class: 'block h-dvh' },
  template: `
    <div class="flex h-full bg-background text-sm text-foreground">
      @if (state.drawerOpen()) {
        <div class="fixed inset-0 z-30 bg-overlay lg:hidden" (click)="state.drawerOpen.set(false)"></div>
      }

      <nav aria-label="Hauptnavigation" class="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface-muted py-3 lg:flex">
        <span class="mb-2 grid size-10 place-items-center rounded-control bg-primary text-on-primary"><app-icon name="file-text" /></span>
        @for (n of nav; track n.screen) {
          <button type="button" [class]="railClass(n.screen)" [attr.aria-label]="n.label" [attr.aria-current]="state.screen() === n.screen ? 'page' : null" [title]="n.label" (click)="state.go(n.screen)">
            <app-icon [name]="n.icon" />
          </button>
        }
        <span class="flex-1"></span>
        <button type="button" [class]="iconBtn" [attr.aria-label]="state.dark() ? 'Helles Design' : 'Dunkles Design'" (click)="state.toggleTheme()"><app-icon [name]="state.dark() ? 'sun' : 'moon'" /></button>
        <span class="mt-1 grid size-9 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary" title="Julian (Admin)">JK</span>
      </nav>

      <aside aria-label="Seitenleiste" class="fixed inset-y-0 left-0 z-40 flex w-70 flex-col border-r border-border bg-surface transition-transform duration-200 lg:visible lg:static lg:translate-x-0" [class]="state.drawerOpen() ? 'translate-x-0' : '-translate-x-full invisible'">
        <div class="space-y-1 border-b border-border p-3 lg:hidden">
          <div class="mb-2 flex items-center justify-between"><span class="font-semibold">Dokumenten-Assistent</span><button type="button" [class]="iconBtn" aria-label="Menü schließen" (click)="state.drawerOpen.set(false)"><app-icon name="x" /></button></div>
          @for (n of nav; track n.screen) {
            <button type="button" class="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-control px-3" [class]="state.screen() === n.screen ? 'bg-primary-soft font-medium text-primary' : 'hover:bg-surface-muted'" (click)="state.go(n.screen)"><app-icon [name]="n.icon" />{{ n.label }}</button>
          }
        </div>

        @switch (state.screen()) {
          @case ('library') {
            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              <h2 class="text-base font-semibold">Filter</h2>
              @for (f of facets; track f.title) {
                <fieldset class="space-y-1">
                  <legend class="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{{ f.title }}</legend>
                  @for (i of f.items; track i.label) {
                    <label class="flex min-h-8 cursor-pointer items-center gap-2 rounded-control px-2 hover:bg-surface-muted pointer-coarse:min-h-11">
                      <input type="checkbox" class="size-4 accent-primary" [checked]="i.on" />
                      <span class="flex-1">{{ i.label }}</span>
                      <span class="text-xs text-muted tabular-nums">{{ i.n }}</span>
                    </label>
                  }
                </fieldset>
              }
            </div>
          }
          @case ('settings') {
            <div class="min-h-0 flex-1 p-4">
              <h2 class="mb-2 text-base font-semibold">Einstellungen</h2>
              <ul class="space-y-1">
                @for (s of sections; track s) {
                  <li><a href="#" class="flex min-h-8 items-center rounded-control px-2 hover:bg-surface-muted pointer-coarse:min-h-11" (click)="$event.preventDefault()">{{ s }}</a></li>
                }
              </ul>
            </div>
          }
          @default {
            <div class="space-y-2 p-3">
              <app-button variant="primary" icon="plus" [block]="true" (click)="state.go('new')">Neuer Chat</app-button>
              <div class="relative">
                <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <label class="sr-only" for="v2-search">Chats durchsuchen</label>
                <input id="v2-search" type="search" placeholder="Chats durchsuchen" [class]="input + ' pl-9'" />
              </div>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3"><proto-chat-list [dense]="true" /></div>
          }
        }
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-1 border-b border-border bg-surface px-2 py-2 lg:hidden">
          <button type="button" [class]="iconBtn" aria-label="Menü öffnen" (click)="state.drawerOpen.set(true)"><app-icon name="menu" /></button>
          <span class="font-semibold">Dokumenten-Assistent</span>
        </header>

        @switch (state.screen()) {
          @case ('new') {
            <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
              <section aria-labelledby="v2-docs" class="flex min-h-0 flex-1 flex-col border-b border-border lg:border-r lg:border-b-0">
                <div class="flex items-center gap-2 border-b border-border p-3">
                  <h1 id="v2-docs" class="text-base font-semibold">Dokumente auswählen</h1>
                  <span class="flex-1"></span>
                  <div class="relative w-56 max-w-full">
                    <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                    <label class="sr-only" for="v2-ds">Dokumente suchen</label>
                    <input id="v2-ds" type="search" placeholder="Suchen" [class]="input + ' pl-9'" />
                  </div>
                </div>
                <ul class="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                  @for (d of docs; track d.id) {
                    <li>
                      <label class="flex min-h-10 items-center gap-3 px-3 py-1" [class]="d.status === 'ready' ? 'cursor-pointer hover:bg-surface-muted' : 'opacity-60'">
                        <input type="checkbox" class="size-4 accent-primary" [checked]="state.isSelected(d.id)" [disabled]="d.status !== 'ready'" (change)="state.toggleDoc(d.id)" />
                        <app-icon [name]="typeIcon[d.type]" [size]="18" class="text-muted" />
                        <span class="min-w-0 flex-1 truncate">{{ d.title }}</span>
                        <span class="hidden text-xs text-muted sm:inline">{{ d.meta }}</span>
                        @if (d.status !== 'ready') { <proto-status [status]="d.status" /> }
                      </label>
                    </li>
                  }
                </ul>
              </section>
              <section aria-labelledby="v2-ask" class="flex shrink-0 flex-col gap-3 bg-surface p-4 lg:w-96">
                <h2 id="v2-ask" class="text-base font-semibold">Frage stellen</h2>
                <p class="text-muted">{{ selectedDocs().length }} Dokumente ausgewählt. Antworten nutzen nur diese Quellen.</p>
                <div class="flex flex-wrap gap-2">
                  @for (d of selectedDocs(); track d.id) {
                    <app-chip icon="file-text" [removable]="true" [removeLabel]="d.title + ' entfernen'" (removed)="state.toggleDoc(d.id)">{{ d.title }}</app-chip>
                  }
                </div>
                <span class="flex-1"></span>
                <proto-composer hint="Enter sendet, Umschalt+Enter neue Zeile" />
              </section>
            </div>
          }

          @case ('library') {
            <div class="flex min-h-0 flex-1 flex-col">
              <div class="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <h1 class="mr-auto text-base font-semibold">Bibliothek <span class="font-normal text-muted">({{ docs.length }})</span></h1>
                <div class="relative w-56 max-w-full">
                  <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                  <label class="sr-only" for="v2-lib">Titel suchen</label>
                  <input id="v2-lib" type="search" placeholder="Titel suchen" [class]="input + ' pl-9'" />
                </div>
                <app-button icon="link" size="sm">URL</app-button>
                <app-button icon="upload" variant="primary" size="sm">Hochladen</app-button>
              </div>
              @if (state.selectedIds().length > 0) {
                <div class="flex items-center gap-3 border-b border-border bg-primary-soft px-3 py-2 text-primary">
                  <span class="font-medium">{{ state.selectedIds().length }} ausgewählt</span>
                  <app-button size="sm" icon="message-square" (click)="state.go('chat')">Chat starten</app-button>
                </div>
              }
              <div class="min-h-0 flex-1 overflow-auto">
                <table class="w-full min-w-xl border-collapse">
                  <caption class="sr-only">Dokumente in der Bibliothek</caption>
                  <thead class="sticky top-0 bg-surface text-left text-xs tracking-wide text-muted uppercase">
                    <tr class="border-b border-border">
                      <th scope="col" class="w-10 px-3 py-2"><span class="sr-only">Auswahl</span></th>
                      <th scope="col" class="w-full px-3 py-2 font-semibold">Titel</th>
                      <th scope="col" class="hidden px-3 py-2 font-semibold md:table-cell">Umfang</th>
                      <th scope="col" class="hidden px-3 py-2 font-semibold md:table-cell">Größe</th>
                      <th scope="col" class="hidden px-3 py-2 font-semibold lg:table-cell">Hinzugefügt</th>
                      <th scope="col" class="px-3 py-2 font-semibold">Status</th>
                      <th scope="col" class="w-10 px-3 py-2"><span class="sr-only">Aktionen</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (d of docs; track d.id) {
                      <tr class="border-b border-border hover:bg-surface-muted" [class.bg-primary-soft]="state.isSelected(d.id)">
                        <td class="px-3 py-1.5"><input type="checkbox" class="size-4 accent-primary" [attr.aria-label]="d.title + ' auswählen'" [checked]="state.isSelected(d.id)" [disabled]="d.status !== 'ready'" (change)="state.toggleDoc(d.id)" /></td>
                        <td class="max-w-0 px-3 py-1.5">
                          <span class="flex items-center gap-2">
                            <app-icon [name]="typeIcon[d.type]" [size]="18" class="text-muted" />
                            <span class="truncate font-medium">{{ d.title }}</span>
                            <span class="shrink-0 rounded bg-surface-muted px-1.5 text-xs text-muted">{{ d.type }}</span>
                            @if (d.shared) { <app-icon name="users" [size]="14" class="shrink-0 text-muted" label="Geteilt" /> }
                          </span>
                          @if (d.error) { <span class="block pl-7 text-xs text-danger">{{ d.error }}</span> }
                        </td>
                        <td class="hidden px-3 py-1.5 text-muted md:table-cell">{{ d.meta }}</td>
                        <td class="hidden px-3 py-1.5 text-muted tabular-nums md:table-cell">{{ d.size }}</td>
                        <td class="hidden px-3 py-1.5 text-muted lg:table-cell">{{ d.added }}</td>
                        <td class="px-3 py-1.5"><proto-status [status]="d.status" /></td>
                        <td class="px-1 py-0.5"><button type="button" [class]="iconBtn" [attr.aria-label]="'Aktionen für ' + d.title"><app-icon name="more" [size]="18" /></button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @case ('chat') {
            <div class="flex min-h-0 flex-1">
              <main class="flex min-w-0 flex-1 flex-col">
                <header class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
                  <h1 class="mr-auto text-base font-semibold">Kündigungsfrist Mietvertrag</h1>
                  <app-chip icon="cpu">llama3.1:8b</app-chip>
                  <app-chip tone="warning" icon="alert-triangle">Nur CPU</app-chip>
                </header>
                <div class="min-h-0 flex-1 overflow-y-auto">
                  <ol class="mx-auto max-w-3xl divide-y divide-border px-4">
                    @for (m of messages; track $index) {
                      <li class="py-4">
                        <p class="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{{ m.role === 'user' ? 'Du' : 'Assistent' }}</p>
                        @if (m.role === 'user') {
                          <p class="text-base">{{ m.text }}</p>
                        } @else if (m.notFound) {
                          <p class="flex items-start gap-2 text-base text-muted"><app-icon name="info" [size]="18" class="mt-0.5" />Dazu finde ich in den ausgewählten Dokumenten nichts.</p>
                        } @else {
                          <p class="text-base leading-relaxed">
                            @for (p of m.parts; track $index) {
                              @if (p.t === 'text') {<span>{{ p.v }}</span>} @else {
                                <button type="button" [class]="citeBtn" [attr.aria-label]="'Quelle ' + p.n + ' anzeigen'" [attr.aria-pressed]="state.citation() === p.n" (click)="state.citation.set(p.n)">{{ p.n }}</button>
                              }
                            }
                          </p>
                          <div class="mt-1 flex gap-1">
                            <button type="button" [class]="iconBtn" aria-label="Kopieren"><app-icon name="copy" [size]="16" /></button>
                            <button type="button" [class]="iconBtn" aria-label="Neu generieren"><app-icon name="refresh" [size]="16" /></button>
                          </div>
                        }
                      </li>
                    }
                  </ol>
                </div>
                <div class="border-t border-border p-3"><div class="mx-auto max-w-3xl"><proto-composer hint="2 Dokumente · Umschalt+Enter neue Zeile" /></div></div>
              </main>

              <aside aria-label="Quellen" class="hidden w-96 shrink-0 flex-col border-l border-border bg-surface lg:flex">
                <h2 class="border-b border-border px-4 py-3 text-base font-semibold">Quellen ({{ citations.length }})</h2>
                <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  @for (c of citations; track c.n) {
                    <li class="rounded-card border p-3" [class]="state.citation() === c.n ? 'border-primary bg-primary-soft/40' : 'border-border'">
                      <button type="button" class="flex w-full cursor-pointer items-center gap-2 text-left" [attr.aria-expanded]="state.citation() === c.n" (click)="state.citation.set(c.n)">
                        <span class="grid size-6 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{{ c.n }}</span>
                        <span class="min-w-0 flex-1"><span class="block truncate font-medium">{{ c.docTitle }}</span><span class="block text-xs text-muted">{{ c.page }} · {{ c.section }}</span></span>
                      </button>
                      @if (state.citation() === c.n) {
                        <blockquote class="mt-3 border-l-4 border-primary py-1 pl-3 font-serif text-base leading-relaxed">{{ c.text }}</blockquote>
                        <div class="mt-3"><app-button size="sm" icon="file-text">Dokument öffnen</app-button></div>
                      }
                    </li>
                  }
                </ul>
              </aside>
            </div>
          }

          @case ('settings') {
            <main class="min-h-0 flex-1 overflow-y-auto"><div class="mx-auto max-w-2xl p-6"><proto-settings /></div></main>
          }
        }
      </div>
    </div>
  `,
})
export class VariantWorkspace {
  protected readonly state = inject(ProtoState);
  protected readonly docs = DOCS;
  protected readonly messages = MESSAGES;
  protected readonly citations = CITATIONS;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly iconBtn = ICON_BTN;
  protected readonly citeBtn = CITE_BTN;
  protected readonly input = INPUT;
  protected readonly sections = ['KI-Modell', 'Zusammenfassungen', 'Konto'];
  protected readonly nav: { screen: ProtoScreen; label: string; icon: IconName }[] = [
    { screen: 'new', label: 'Neuer Chat', icon: 'plus' },
    { screen: 'library', label: 'Bibliothek', icon: 'library' },
    { screen: 'chat', label: 'Chats', icon: 'message-square' },
    { screen: 'settings', label: 'Einstellungen', icon: 'settings' },
  ];
  protected readonly selectedDocs = computed(() => DOCS.filter((d) => this.state.selectedIds().includes(d.id)));
  protected readonly facets = [
    { title: 'Besitz', items: [{ label: 'Meine', n: DOCS.filter((d) => !d.shared).length, on: true }, { label: 'Mit mir geteilt', n: DOCS.filter((d) => d.shared).length, on: true }] },
    { title: 'Status', items: [{ label: 'Bereit', n: DOCS.filter((d) => d.status === 'ready').length, on: true }, { label: 'In Arbeit', n: DOCS.filter((d) => ['reading', 'indexing', 'queued'].includes(d.status)).length, on: true }, { label: 'Fehler', n: DOCS.filter((d) => d.status === 'failed').length, on: true }] },
    { title: 'Typ', items: ['PDF', 'DOCX', 'PPTX', 'URL', 'EPUB'].map((t) => ({ label: t, n: DOCS.filter((d) => d.type === t).length, on: true })) },
  ];

  /**
   * Class for a rail button.
   * @param screen - Screen the button leads to.
   * @returns Tailwind classes, filled when active.
   */
  protected railClass(screen: ProtoScreen): string {
    return (
      'grid size-10 cursor-pointer place-items-center rounded-control transition-colors duration-150 pointer-coarse:size-11 ' +
      (this.state.screen() === screen ? 'bg-primary text-on-primary' : 'text-foreground hover:bg-surface')
    );
  }
}
