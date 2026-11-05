import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiClient, ApiRequestError, ChatDetail, DocumentOut } from '../../core/api';
import { de } from '../../core/i18n/de';
import { ToastService } from '../../core/toast.service';
import { formatBytes } from '../../domain/documents';
import { ChatStore } from '../../state/chat.store';
import { ChatsStore } from '../../state/chats.store';
import { DraftStore } from '../../state/drafts.store';
import { SettingsStore } from '../../state/settings.store';
import { ComposerComponent } from '../../ui/molecules/composer/composer.component';
import { DocumentPickerComponent, PickerDocument } from '../../ui/organisms/document-picker/document-picker.component';

/** "Neuer Chat": pick documents, ask the first question; sending creates the chat. */
@Component({
  selector: 'app-new-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ComposerComponent, DocumentPickerComponent],
  template: `
    <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-5 px-5 py-10">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight">{{ t.newTitle }}</h1>
        <p class="mt-2 text-muted">{{ t.newIntro }}</p>
      </div>

      @if (noModel()) {
        <p class="rounded-control border border-border bg-surface px-4 py-3 text-sm">
          {{ t.noModel }} <a routerLink="/settings" class="text-primary underline">{{ t.toSettings }}</a>
        </p>
      }

      <app-document-picker [documents]="documents()" [(selected)]="selected" />
      @if (error()) { <p role="alert" class="text-sm text-danger">{{ error() }}</p> }
      <app-composer [(value)]="text" [hint]="hint()" [disabled]="creating()" (submitted)="start($event)" />
    </div>
  `,
})
export class NewChatPage {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly chatStore = inject(ChatStore);
  private readonly chats = inject(ChatsStore);
  private readonly settings = inject(SettingsStore);
  private readonly drafts = inject(DraftStore);
  protected readonly t = de.chat;

  protected readonly docs = signal<DocumentOut[]>([]);
  protected readonly selected = this.drafts.newChatSelected;
  protected readonly text = this.drafts.newChatText;
  protected readonly creating = signal(false);
  protected readonly error = signal('');
  protected readonly documents = computed<PickerDocument[]>(() =>
    this.docs().map((d) => ({ id: d.id, title: d.title, meta: [(de.kinds as Record<string, string>)[d.kind] ?? d.kind, formatBytes(d.size_bytes)].filter(Boolean).join(' · ') })),
  );
  protected readonly noModel = computed(() => {
    const s = this.settings.settings();
    return s !== null && !s.model;
  });
  protected readonly hint = computed(() => this.t.selectedCount.replace('{n}', String(this.selected().length)));

  constructor() {
    const preselected = inject(ActivatedRoute).snapshot.queryParamMap.getAll('doc');
    void this.load(preselected);
  }

  /**
   * Load the ready documents and the settings (to know whether a model is chosen).
   * @param preselected - Document ids from the link "Chat mit diesem Dokument".
   */
  private async load(preselected: string[]): Promise<void> {
    try {
      this.docs.set(await this.api.get<DocumentOut[]>('/documents?status=ready'));
      if (preselected.length) this.selected.set(preselected.filter((id) => this.docs().some((d) => d.id === id)));
      await this.settings.load();
    } catch (e) {
      this.toast.show(e instanceof ApiRequestError ? e.message : de.errors.unknown, 'danger');
    }
  }

  /**
   * Create the chat and open it; the chat page sends the first question.
   * @param question - The first question.
   */
  protected async start(question: string): Promise<void> {
    this.error.set('');
    if (this.selected().length === 0) {
      this.error.set(de.chat.pickOne);
      return;
    }
    this.creating.set(true);
    try {
      const chat = await this.api.post<ChatDetail>('/chats', { document_ids: this.selected() });
      this.chats.upsert({ id: chat.id, title: chat.title, created_at: chat.created_at, updated_at: chat.updated_at });
      this.chatStore.pendingFirst = { chatId: chat.id, text: question };
      this.text.set('');
      await this.router.navigate(['/chat', chat.id]);
    } catch (e) {
      this.error.set(e instanceof ApiRequestError ? e.message : de.errors.unknown);
    } finally {
      this.creating.set(false);
    }
  }
}
