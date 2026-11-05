import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ApiRequestError } from '../../core/api';
import { de } from '../../core/i18n/de';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { groupChats } from '../../domain/chats';
import { ChatStore } from '../../state/chat.store';
import { ChatsStore } from '../../state/chats.store';
import { SessionStore } from '../../state/session.store';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { InputComponent } from '../../ui/atoms/input/input.component';
import { ChatOpenRequest } from '../../ui/organisms/chat-list/chat-list.component';
import { DialogComponent } from '../../ui/organisms/dialog/dialog.component';
import { AppShellComponent } from '../../ui/templates/app-shell/app-shell.component';

/** Frame for every page after login: the app shell wired to the session, the theme and the chat list. */
@Component({
  selector: 'app-layout-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppShellComponent, RouterOutlet, DialogComponent, InputComponent, ButtonComponent],
  template: `
    <app-shell
      [userName]="session.user()?.display_name ?? ''"
      [isAdmin]="session.user()?.role === 'admin'"
      [dark]="theme.dark()"
      [chatGroups]="groups()"
      [chatResults]="chats.results()"
      [chatQuery]="chats.query()"
      [activeChatId]="chat.chat()?.id ?? null"
      (logout)="session.logout()"
      (themeToggle)="theme.toggle()"
      (chatSearch)="onSearch($event)"
      (chatOpen)="openChat($event)"
      (chatRename)="startRename($event)"
      (chatDelete)="startDelete($event)"
    >
      <router-outlet />
    </app-shell>

    <app-dialog [(open)]="renameOpen" [title]="t.rename">
      <form (submit)="saveRename($event)">
        <app-input [label]="t.rename" [(value)]="renameValue" [autofocus]="true" />
      </form>
      <ng-container dialog-actions>
        <app-button (click)="renameOpen.set(false)">{{ c.cancel }}</app-button>
        <app-button variant="primary" (click)="saveRename()">{{ c.save }}</app-button>
      </ng-container>
    </app-dialog>

    <app-dialog [(open)]="deleteOpen" [title]="t.deleteTitle" [description]="t.deleteText">
      <ng-container dialog-actions>
        <app-button (click)="deleteOpen.set(false)">{{ c.cancel }}</app-button>
        <app-button variant="danger" (click)="confirmDelete()">{{ t.delete }}</app-button>
      </ng-container>
    </app-dialog>
  `,
})
export class AppLayoutPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private targetId = '';
  protected readonly session = inject(SessionStore);
  protected readonly theme = inject(ThemeService);
  protected readonly chats = inject(ChatsStore);
  protected readonly chat = inject(ChatStore);
  protected readonly t = de.chat;
  protected readonly c = de.common;
  protected readonly groups = computed(() => groupChats(this.chats.chats()));

  protected readonly renameOpen = signal(false);
  protected readonly renameValue = signal('');
  protected readonly deleteOpen = signal(false);

  constructor() {
    void this.chats.load().catch((e: unknown) => this.fail(e));
  }

  /** Clear the search timer. */
  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  /**
   * Show an error as a toast.
   * @param e - The caught error.
   */
  private fail(e: unknown): void {
    this.toast.show(e instanceof ApiRequestError ? e.message : de.errors.unknown, 'danger');
  }

  /**
   * Search chats after a short pause in typing.
   * @param text - The search text.
   */
  protected onSearch(text: string): void {
    this.chats.query.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.chats.search(text).catch((e: unknown) => this.fail(e)), 250);
  }

  /**
   * Open a chat (and scroll to a message for search results).
   * @param request - Which chat and message.
   */
  protected openChat(request: ChatOpenRequest): void {
    void this.router.navigate(['/chat', request.id], { queryParams: request.messageId ? { m: request.messageId } : {} });
  }

  /**
   * Open the rename dialog.
   * @param id - Id of the chat.
   */
  protected startRename(id: string): void {
    this.targetId = id;
    this.renameValue.set(this.chats.chats().find((x) => x.id === id)?.title ?? '');
    this.renameOpen.set(true);
  }

  /**
   * Save the new title.
   * @param event - The form submit event, if sent with Enter.
   */
  protected async saveRename(event?: Event): Promise<void> {
    event?.preventDefault();
    const title = this.renameValue().trim();
    if (!title) return;
    try {
      await this.chats.rename(this.targetId, title);
      const open = this.chat.chat();
      if (open?.id === this.targetId) this.chat.chat.set({ ...open, title });
      this.renameOpen.set(false);
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Open the delete confirmation.
   * @param id - Id of the chat.
   */
  protected startDelete(id: string): void {
    this.targetId = id;
    this.deleteOpen.set(true);
  }

  /** Delete the chat after the confirmation. */
  protected async confirmDelete(): Promise<void> {
    try {
      await this.chats.remove(this.targetId);
      this.deleteOpen.set(false);
      this.toast.show(de.chat.deleted);
      if (this.chat.chat()?.id === this.targetId) {
        this.chat.close();
        await this.router.navigate(['/']);
      }
    } catch (e) {
      this.fail(e);
    }
  }
}
