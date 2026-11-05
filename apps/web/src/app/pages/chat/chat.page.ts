import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClient, ApiRequestError, ChunkOut, DocumentOut, OllamaFit } from '../../core/api';
import { de } from '../../core/i18n/de';
import { ToastService } from '../../core/toast.service';
import { formatBytes } from '../../domain/documents';
import { ChatStore } from '../../state/chat.store';
import { DraftStore } from '../../state/drafts.store';
import { SettingsStore } from '../../state/settings.store';
import { BadgeComponent } from '../../ui/atoms/badge/badge.component';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { InputComponent } from '../../ui/atoms/input/input.component';
import { ComposerComponent } from '../../ui/molecules/composer/composer.component';
import { MessageComponent } from '../../ui/molecules/message/message.component';
import { CitationPanelComponent } from '../../ui/organisms/citation-panel/citation-panel.component';
import { DialogComponent } from '../../ui/organisms/dialog/dialog.component';
import { DocumentPickerComponent, PickerDocument } from '../../ui/organisms/document-picker/document-picker.component';

/** A chat: header, messages with streamed answers, source panel, question box. */
@Component({
  selector: 'app-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent, BadgeComponent, InputComponent, ComposerComponent, MessageComponent, CitationPanelComponent, DialogComponent, DocumentPickerComponent],
  template: `
    <div class="flex h-full min-h-0">
      <div #scroller class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5">
          @if (store.chat(); as c) {
            <header class="space-y-2 pt-8 pb-5">
              @if (renaming()) {
                <form class="flex items-end gap-2" (submit)="saveTitle($event)">
                  <app-input class="flex-1" [label]="t.rename" [(value)]="titleDraft" [autofocus]="true" />
                  <app-button type="submit" variant="primary">{{ common.save }}</app-button>
                  <app-button (click)="renaming.set(false)">{{ common.cancel }}</app-button>
                </form>
              } @else {
                <h1 class="text-2xl font-semibold tracking-tight">
                  {{ c.title || t.untitled }}
                  <button type="button" class="ml-2 min-h-9 cursor-pointer rounded-control px-2 align-middle text-sm font-normal text-muted hover:text-foreground" (click)="startRename(c.title)">{{ t.rename }}</button>
                </h1>
              }
              <p class="text-sm text-muted">
                @for (d of c.documents; track d.id) {<a class="hover:underline" [routerLink]="['/library', d.id]">{{ d.title }}</a>@if (!$last) {, }}
                · <button type="button" class="cursor-pointer text-primary underline" (click)="openDocs()">{{ t.editDocs }}</button>
              </p>
              <p class="flex flex-wrap items-center gap-2 text-sm text-muted">
                @if (modelName()) { <span>{{ t.model }}: {{ modelName() }}</span> }
                @if (fit(); as f) { @if (f.verdict !== 'fits') { <app-badge tone="warning">{{ verdicts[f.verdict] }}</app-badge> } }
              </p>
            </header>

            <ol class="flex-1 space-y-7 pb-6">
              @for (m of store.messages(); track m.id; let last = $last) {
                <li>
                  <app-message
                    [role]="m.role"
                    [messageId]="m.id"
                    [content]="m.content"
                    [citations]="m.citations"
                    [streaming]="m.streaming"
                    [interrupted]="m.interrupted"
                    [error]="m.error"
                    [canRegenerate]="last && m.role === 'assistant' && !store.busy()"
                    (citationClicked)="showCitation(m.id, $event)"
                    (copied)="copy(m.content)"
                    (regenerate)="store.regenerate()"
                  />
                </li>
              }
            </ol>

            <div class="sticky bottom-0 bg-background pt-2 pb-5">
              @if (store.sendError()) { <p role="alert" class="mb-2 text-sm text-danger">{{ store.sendError() }} <a routerLink="/settings" class="underline">{{ t.toSettings }}</a></p> }
              <app-composer [(value)]="text" [busy]="store.busy()" (submitted)="ask($event)" (stopped)="store.stop()" />
            </div>
          }
        </div>
      </div>

      @if (panelNumber() !== null) {
        <app-citation-panel [number]="panelNumber()!" [chunk]="chunk()" [loading]="chunkLoading()" [gone]="chunkGone()" (closed)="panelNumber.set(null)" />
      }
    </div>

    <div class="sr-only" aria-live="polite">{{ announcement() }}</div>

    <app-dialog [(open)]="docsOpen" [title]="t.docsTitle">
      <app-document-picker [documents]="pickerDocs()" [(selected)]="pickedIds" />
      <ng-container dialog-actions>
        <app-button (click)="docsOpen.set(false)">{{ common.cancel }}</app-button>
        <app-button variant="primary" (click)="saveDocs()">{{ common.save }}</app-button>
      </ng-container>
    </app-dialog>
  `,
})
export class ChatPage implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly settings = inject(SettingsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly drafts = inject(DraftStore);
  private readonly chatId = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private scrolledTo = '';
  protected readonly store = inject(ChatStore);
  protected readonly t = de.chat;
  protected readonly common = de.common;
  protected readonly verdicts = de.fit.verdicts;

  protected readonly text = signal(this.drafts.chatDraft(this.chatId));
  protected readonly renaming = signal(false);
  protected readonly titleDraft = signal('');
  protected readonly fit = signal<OllamaFit | null>(null);
  protected readonly announcement = signal('');

  protected readonly panelNumber = signal<number | null>(null);
  protected readonly chunk = signal<ChunkOut | null>(null);
  protected readonly chunkLoading = signal(false);
  protected readonly chunkGone = signal(false);

  protected readonly docsOpen = signal(false);
  protected readonly allDocs = signal<DocumentOut[]>([]);
  protected readonly pickedIds = signal<string[]>([]);
  protected readonly pickerDocs = computed<PickerDocument[]>(() =>
    this.allDocs().map((d) => ({ id: d.id, title: d.title, meta: [(de.kinds as Record<string, string>)[d.kind] ?? d.kind, formatBytes(d.size_bytes)].filter(Boolean).join(' · ') })),
  );
  protected readonly modelName = computed(() => this.settings.settings()?.model ?? this.store.chat()?.model ?? '');

  constructor() {
    void this.init();
    // Keep the unsent question when the person switches to another page and back.
    effect(() => this.drafts.setChatDraft(this.chatId, this.text()));
    // Keep the newest text in view while an answer streams (only if the person is near the bottom).
    effect(() => {
      this.store.messages();
      const el = this.scroller().nativeElement;
      const target = this.route.snapshot.queryParamMap.get('m');
      if (target && this.scrolledTo !== target) {
        const node = document.getElementById(`msg-${target}`);
        if (node) {
          this.scrolledTo = target;
          node.scrollIntoView({ block: 'center' });
          return;
        }
      }
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) el.scrollTop = el.scrollHeight;
    });
    // Screen readers hear the finished answer once, not every token.
    effect(() => {
      const last = this.store.messages().at(-1);
      if (last && last.role === 'assistant' && !last.streaming && last.content) this.announcement.set(last.content);
    });
  }

  /** Stop a running answer when the page closes. */
  ngOnDestroy(): void {
    this.store.stop();
  }

  /** Open the chat from the route, send a pending first question, and check the model's hardware fit. */
  private async init(): Promise<void> {
    const id = this.chatId;
    try {
      await this.store.open(id);
      await this.settings.load();
    } catch (e) {
      this.fail(e);
      return;
    }
    const pending = this.store.pendingFirst;
    if (pending?.chatId === id) {
      this.store.pendingFirst = null;
      void this.store.send(pending.text);
    }
    void this.checkFit();
  }

  /** Show an amber badge if the chosen local model is a poor fit for the server. */
  private async checkFit(): Promise<void> {
    const s = this.settings.settings();
    const local = s?.providers.find((p) => p.id === s.provider_id)?.local;
    if (!s?.model || !local) return;
    try {
      this.fit.set(await this.api.get<OllamaFit>(`/hardware/ollama-fit?model=${encodeURIComponent(s.model)}`));
    } catch {
      // INFO: Ollama may be down right now; the badge is only a hint.
    }
  }

  /**
   * Show an error as a toast.
   * @param e - The caught error.
   */
  private fail(e: unknown): void {
    this.toast.show(e instanceof ApiRequestError ? e.message : de.errors.unknown, 'danger');
  }

  /**
   * Send a question.
   * @param question - The question text.
   */
  protected async ask(question: string): Promise<void> {
    this.text.set('');
    await this.store.send(question);
    if (this.store.sendError()) this.text.set(question);
  }

  /**
   * Copy an answer to the clipboard.
   * @param content - The answer text.
   */
  protected async copy(content: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      this.toast.show(de.chat.copied);
    } catch {
      this.toast.show(de.errors.unknown, 'danger');
    }
  }

  /**
   * Start renaming the chat.
   * @param title - Current title.
   */
  protected startRename(title: string | null): void {
    this.titleDraft.set(title ?? '');
    this.renaming.set(true);
  }

  /**
   * Save the new title.
   * @param event - The form submit event.
   */
  protected async saveTitle(event: Event): Promise<void> {
    event.preventDefault();
    const title = this.titleDraft().trim();
    if (!title) return;
    try {
      await this.store.rename(title);
      this.renaming.set(false);
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Open the side panel with the passage behind a citation.
   * @param messageId - Id of the answer.
   * @param n - The citation number.
   */
  protected async showCitation(messageId: string, n: number): Promise<void> {
    const citation = this.store.messages().find((m) => m.id === messageId)?.citations.find((c) => c.n === n);
    if (!citation) return;
    this.panelNumber.set(n);
    this.chunk.set(null);
    this.chunkGone.set(false);
    this.chunkLoading.set(true);
    try {
      this.chunk.set(await this.api.get<ChunkOut>(`/chunks/${citation.chunk_id}`));
    } catch {
      this.chunkGone.set(true);
    } finally {
      this.chunkLoading.set(false);
    }
  }

  /** Open the dialog to change the chat's documents. */
  protected async openDocs(): Promise<void> {
    try {
      this.allDocs.set(await this.api.get<DocumentOut[]>('/documents?status=ready'));
      this.pickedIds.set(this.store.chat()?.documents.map((d) => d.id) ?? []);
      this.docsOpen.set(true);
    } catch (e) {
      this.fail(e);
    }
  }

  /** Save the changed document selection. */
  protected async saveDocs(): Promise<void> {
    if (this.pickedIds().length === 0) {
      this.toast.show(de.chat.pickOne, 'danger');
      return;
    }
    try {
      await this.store.setDocuments(this.pickedIds());
      this.docsOpen.set(false);
    } catch (e) {
      this.fail(e);
    }
  }
}
