import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonComponent } from '../app/ui/atoms/button/button.component';
import { ChipComponent } from '../app/ui/atoms/chip/chip.component';
import { IconComponent } from '../app/ui/atoms/icon/icon.component';
import { CITATIONS, DOCS, MESSAGES, ProtoDoc, TYPE_ICON } from './proto-data';
import { ICON_BTN, INPUT, ProtoChatList, ProtoComposer, ProtoSettings, ProtoStatus } from './proto-bits';
import { ProtoScreen, ProtoState } from './proto-state';

/**
 * Variant 3, "Lesesaal": editorial and reading first. Serif headings and answers, documents as
 * cards on a shelf, sources printed as footnotes under each answer (no side panel).
 */
@Component({
  selector: 'proto-reading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ChipComponent, ButtonComponent, ProtoStatus, ProtoComposer, ProtoChatList, ProtoSettings],
  host: { class: 'block h-dvh' },
  template: `
    <div class="flex h-full bg-background text-foreground">
      @if (state.drawerOpen()) {
        <div class="fixed inset-0 z-30 bg-overlay lg:hidden" (click)="state.drawerOpen.set(false)"></div>
      }

      <aside aria-label="Seitenleiste" class="fixed inset-y-0 left-0 z-40 flex w-70 flex-col bg-surface-muted transition-transform duration-200 lg:visible lg:static lg:translate-x-0" [class]="state.drawerOpen() ? 'translate-x-0' : '-translate-x-full invisible'">
        <div class="flex items-center justify-between px-5 pt-6 pb-4">
          <span class="font-serif text-xl leading-tight font-semibold">Dokumenten-<br />Assistent</span>
          <button type="button" [class]="iconBtn + ' lg:hidden'" aria-label="Menü schließen" (click)="state.drawerOpen.set(false)"><app-icon name="x" /></button>
        </div>

        <nav aria-label="Hauptnavigation" class="space-y-0.5 px-3">
          <button type="button" [class]="navClass('new')" (click)="state.go('new')"><app-icon name="plus" />Neuer Chat</button>
          <button type="button" [class]="navClass('library')" (click)="state.go('library')"><app-icon name="library" />Bibliothek</button>
        </nav>

        <div class="relative mx-3 mt-4">
          <app-icon name="search" [size]="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <label class="sr-only" for="v3-search">Chats durchsuchen</label>
          <input id="v3-search" type="search" placeholder="Chats durchsuchen" [class]="input + ' rounded-full pl-9'" />
        </div>

        <div class="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2"><proto-chat-list /></div>

        <div class="space-y-1 px-3 pb-4">
          <button type="button" [class]="navClass('settings')" (click)="state.go('settings')"><app-icon name="settings" />Einstellungen</button>
          <div class="flex items-center gap-2 px-2 pt-2">
            <span class="grid size-9 place-items-center rounded-full bg-surface text-sm font-semibold" aria-hidden="true">JK</span>
            <span class="min-w-0 flex-1 text-sm leading-tight"><span class="block truncate font-medium">Julian</span><span class="text-xs text-muted">Admin</span></span>
            <button type="button" [class]="iconBtn" [attr.aria-label]="state.dark() ? 'Helles Design' : 'Dunkles Design'" (click)="state.toggleTheme()"><app-icon [name]="state.dark() ? 'sun' : 'moon'" /></button>
            <button type="button" [class]="iconBtn" aria-label="Abmelden"><app-icon name="log-out" /></button>
          </div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-1 border-b border-border px-2 py-2 lg:hidden">
          <button type="button" [class]="iconBtn" aria-label="Menü öffnen" (click)="state.drawerOpen.set(true)"><app-icon name="menu" /></button>
          <span class="font-serif font-semibold">Dokumenten-Assistent</span>
        </header>

        <main class="min-h-0 flex-1 overflow-y-auto">
          @switch (state.screen()) {
            @case ('new') {
              <div class="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center gap-8 px-5 py-10">
                <div>
                  <h1 class="font-serif text-4xl font-semibold tracking-tight lg:text-5xl">Was möchtest du nachlesen?</h1>
                  <p class="mt-3 max-w-prose text-lg text-muted">Stell ein paar Dokumente ins Regal und frag los. Jede Antwort zeigt dir, woher sie stammt.</p>
                </div>

                <section aria-labelledby="v3-shelf">
                  <h2 id="v3-shelf" class="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">Dein Regal · {{ selectedDocs().length }} ausgewählt</h2>
                  <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    @for (d of readyDocs; track d.id) {
                      <li>
                        <button type="button" role="checkbox" [attr.aria-checked]="state.isSelected(d.id)" class="relative flex h-full min-h-20 w-full cursor-pointer items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors duration-150 hover:bg-surface-muted" [class]="state.isSelected(d.id) ? 'border-primary ring-2 ring-primary' : 'border-border'" (click)="state.toggleDoc(d.id)">
                          <span class="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary"><app-icon [name]="typeIcon[d.type]" /></span>
                          <span class="min-w-0 flex-1">
                            <span class="block pr-6 font-serif leading-snug font-semibold">{{ d.title }}</span>
                            <span class="mt-0.5 block text-sm text-muted">{{ d.type }} · {{ d.meta }}</span>
                          </span>
                          @if (state.isSelected(d.id)) { <span class="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-primary text-on-primary"><app-icon name="check" [size]="14" /></span> }
                        </button>
                      </li>
                    }
                  </ul>
                </section>

                <div class="mx-auto w-full max-w-2xl"><proto-composer [hint]="selectedDocs().length + ' Dokumente im Regal'" /></div>
              </div>
            }

            @case ('library') {
              <div class="mx-auto w-full max-w-5xl space-y-10 px-5 py-10">
                <div class="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h1 class="font-serif text-4xl font-semibold tracking-tight">Bibliothek</h1>
                    <p class="mt-2 text-muted">{{ docs.length }} Dokumente · 3 mit dem Haushalt geteilt</p>
                  </div>
                  <div class="flex gap-2">
                    <app-button icon="link">URL importieren</app-button>
                    <app-button variant="primary" icon="upload">Hochladen</app-button>
                  </div>
                </div>

                @for (g of groups; track g.title) {
                  <section [attr.aria-label]="g.title">
                    <h2 class="mb-3 flex items-center gap-2 border-b border-border pb-2 font-serif text-xl font-semibold">{{ g.title }} <span class="font-sans text-sm font-normal text-muted">{{ g.items.length }}</span></h2>
                    <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      @for (d of g.items; track d.id) {
                        <li class="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
                          <div class="flex items-start justify-between gap-2">
                            <span class="grid size-11 place-items-center rounded-control bg-surface-muted text-muted"><app-icon [name]="typeIcon[d.type]" [size]="22" /></span>
                            @if (d.shared) { <app-chip icon="users">Geteilt</app-chip> }
                          </div>
                          <div class="flex-1">
                            <h3 class="line-clamp-2 font-serif text-lg leading-snug font-semibold">{{ d.title }}</h3>
                            <p class="mt-1 text-sm text-muted">{{ d.type }} · {{ d.meta }} · {{ d.added }}</p>
                            @if (d.error) { <p class="mt-2 text-sm text-danger">{{ d.error }}</p> }
                          </div>
                          <div class="flex items-center justify-between gap-2">
                            <proto-status [status]="d.status" />
                            @if (d.status === 'failed') { <app-button size="sm" icon="refresh">Erneut versuchen</app-button> }
                            @else if (d.status === 'ready') { <app-button size="sm" icon="message-square" (click)="state.go('chat')">Chat</app-button> }
                          </div>
                        </li>
                      }
                    </ul>
                  </section>
                }
              </div>
            }

            @case ('chat') {
              <div class="mx-auto flex min-h-full w-full max-w-prose flex-col px-5">
                <header class="space-y-3 pt-8 pb-6">
                  <h1 class="font-serif text-3xl font-semibold tracking-tight">Kündigungsfrist Mietvertrag</h1>
                  <div class="flex flex-wrap items-center gap-2">
                    <app-chip icon="file-text">Mietvertrag Wohnung Linz</app-chip>
                    <app-chip icon="cpu">llama3.1:8b</app-chip>
                    <app-chip tone="warning" icon="alert-triangle">Nur CPU</app-chip>
                  </div>
                </header>

                <ol class="flex-1 space-y-10 pb-8">
                  @for (m of messages; track $index) {
                    @if (m.role === 'user') {
                      <li><p class="border-l-4 border-primary pl-4 font-serif text-xl leading-snug font-semibold">{{ m.text }}</p></li>
                    } @else {
                      <li class="space-y-4">
                        @if (m.notFound) {
                          <p class="flex items-start gap-2 font-serif text-lg text-muted italic"><app-icon name="info" [size]="20" class="mt-1 shrink-0 not-italic" />Dazu finde ich in den ausgewählten Dokumenten nichts.</p>
                        } @else {
                          <p class="font-serif text-lg leading-8">
                            @for (p of m.parts; track $index) {
                              @if (p.t === 'text') {<span>{{ p.v }}</span>} @else {
                                <sup><a [href]="'#fn' + p.n" class="inline-block rounded px-0.5 font-sans text-xs font-bold text-primary underline decoration-2 underline-offset-2 pointer-coarse:min-w-8 pointer-coarse:py-2 pointer-coarse:text-center" [attr.aria-label]="'Quelle ' + p.n" (click)="$event.preventDefault(); state.citation.set(p.n)">{{ p.n }}</a></sup>
                              }
                            }
                          </p>
                          <div class="flex gap-1">
                            <button type="button" [class]="iconBtn" aria-label="Kopieren"><app-icon name="copy" [size]="16" /></button>
                            <button type="button" [class]="iconBtn" aria-label="Neu generieren"><app-icon name="refresh" [size]="16" /></button>
                          </div>
                          <section aria-label="Quellen" class="space-y-3 border-t border-border pt-4">
                            <h2 class="text-xs font-semibold tracking-wide text-muted uppercase">Quellen</h2>
                            <ol class="space-y-3">
                              @for (c of citations; track c.n) {
                                <li [id]="'fn' + c.n" class="rounded-control p-3 transition-colors" [class]="state.citation() === c.n ? 'bg-primary-soft/50' : ''">
                                  <p class="text-sm"><span class="font-bold text-primary">{{ c.n }}</span> · <span class="font-medium">{{ c.docTitle }}</span> <span class="text-muted">· {{ c.page }} · {{ c.section }}</span></p>
                                  <blockquote class="mt-1.5 border-l-2 border-border-strong pl-3 font-serif leading-relaxed text-muted">{{ c.text }}</blockquote>
                                </li>
                              }
                            </ol>
                          </section>
                        }
                      </li>
                    }
                  }
                </ol>

                <div class="sticky bottom-0 bg-background pt-2 pb-5"><proto-composer hint="Frage nach, die letzten Fragen gehören zum Gespräch." /></div>
              </div>
            }

            @case ('settings') {
              <div class="mx-auto w-full max-w-2xl px-5 py-10">
                <h1 class="mb-8 font-serif text-4xl font-semibold tracking-tight">Einstellungen</h1>
                <proto-settings />
              </div>
            }
          }
        </main>
      </div>
    </div>
  `,
})
export class VariantReading {
  protected readonly state = inject(ProtoState);
  protected readonly docs = DOCS;
  protected readonly readyDocs = DOCS.filter((d) => d.status === 'ready');
  protected readonly messages = MESSAGES;
  protected readonly citations = CITATIONS;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly iconBtn = ICON_BTN;
  protected readonly input = INPUT;
  protected readonly selectedDocs = computed(() => DOCS.filter((d) => this.state.selectedIds().includes(d.id)));
  protected readonly groups: { title: string; items: ProtoDoc[] }[] = [
    { title: 'Bereit', items: DOCS.filter((d) => d.status === 'ready') },
    { title: 'In Bearbeitung', items: DOCS.filter((d) => ['reading', 'indexing', 'queued'].includes(d.status)) },
    { title: 'Fehler', items: DOCS.filter((d) => d.status === 'failed') },
  ];

  /**
   * Class for a sidebar navigation button.
   * @param screen - Screen the button leads to.
   * @returns Tailwind classes, highlighted when that screen is open.
   */
  protected navClass(screen: ProtoScreen): string {
    return (
      'flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-full px-4 text-sm transition-colors duration-150 pointer-coarse:min-h-11 ' +
      (this.state.screen() === screen ? 'bg-surface font-semibold shadow-sm' : 'hover:bg-surface/60')
    );
  }
}
