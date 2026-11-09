import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ChatSummary } from '../../../core/api';
import { de } from '../../../core/i18n/de';
import { ChatGroup, snippetParts } from '../../../domain/chats';
import { InputComponent } from '../../atoms/input/input.component';

/** What the person opened: a chat, and for search results the message to scroll to. */
export interface ChatOpenRequest {
  id: string;
  messageId: string | null;
}

/**
 * Sidebar block: the chat search field and the chats grouped by date (Heute, Gestern, Letzte 7 Tage,
 * Älter). While searching it lists matches with a highlighted snippet. It only shows data and
 * reports what the person wants; the page does the work.
 */
@Component({
  selector: 'app-chat-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputComponent],
  host: { class: 'block' },
  template: `
    <app-input [label]="t.searchChats" [hideLabel]="true" type="search" [placeholder]="t.searchChats" [value]="query()" (valueChange)="searchChanged.emit($event)" />
    <nav aria-label="Chats" class="mt-1">
      @if (results(); as found) {
        <ul class="mt-2">
          @for (r of found; track r.id) {
            <li>
              <button type="button" class="min-h-9 w-full cursor-pointer rounded-control px-3 py-1.5 text-left text-sm hover:bg-surface-muted" (click)="opened.emit({ id: r.id, messageId: r.message_id })">
                <span class="block truncate font-medium">{{ r.title || t.untitled }}</span>
                @if (r.snippet) {
                  <span class="block text-xs text-muted">@for (p of parts(r.snippet); track $index) {@if (p.mark) {<mark class="rounded bg-warning-soft px-0.5 text-foreground">{{ p.text }}</mark>} @else {<span>{{ p.text }}</span>}}</span>
                }
              </button>
            </li>
          } @empty {
            <li class="px-3 py-3 text-sm text-muted">{{ t.noResults }}</li>
          }
        </ul>
      } @else {
        @for (g of groups(); track g.name) {
          <h3 class="px-3 pt-4 pb-1 text-xs font-medium text-muted">{{ g.name }}</h3>
          <ul>
            @for (c of g.chats; track c.id) {
              <li class="group">
                <div class="flex items-center rounded-control" [class]="c.id === activeId() ? 'bg-primary-soft text-primary' : 'hover:bg-surface-muted'">
                  <button type="button" class="min-h-9 min-w-0 flex-1 cursor-pointer truncate px-3 text-left text-sm pointer-coarse:min-h-11" [class.font-medium]="c.id === activeId()" [attr.aria-current]="c.id === activeId() ? 'page' : null" (click)="opened.emit({ id: c.id, messageId: null })">{{ c.title || t.untitled }}</button>
                  <span class="hidden shrink-0 gap-1 pr-1 text-xs text-muted group-focus-within:flex group-hover:flex pointer-coarse:flex">
                    <button type="button" class="cursor-pointer rounded px-1 hover:text-foreground" (click)="renameRequested.emit(c.id)">{{ t.rename }}</button>
                    <button type="button" class="cursor-pointer rounded px-1 hover:text-foreground" (click)="deleteRequested.emit(c.id)">{{ t.delete }}</button>
                  </span>
                </div>
              </li>
            }
          </ul>
        } @empty {
          <p class="px-3 pt-4 text-sm text-muted">{{ t.noChats }}</p>
        }
      }
    </nav>
  `,
})
export class ChatListComponent {
  protected readonly t = de.chat;

  /** Chats grouped by date. */
  readonly groups = input<ChatGroup<ChatSummary>[]>([]);
  /** Search results, or null when there is no search text. */
  readonly results = input<ChatSummary[] | null>(null);
  /** Id of the open chat. */
  readonly activeId = input<string | null>(null);
  /** The text in the search field. */
  readonly query = input('');
  /** Emits the search text when it changes. */
  readonly searchChanged = output<string>();
  /** Emits when a chat or a search result is chosen. */
  readonly opened = output<ChatOpenRequest>();
  /** Emits the id of the chat to rename. */
  readonly renameRequested = output<string>();
  /** Emits the id of the chat to delete. */
  readonly deleteRequested = output<string>();

  /**
   * Split a snippet into plain and highlighted parts.
   * @param snippet - Snippet with `[[match]]` markers.
   * @returns The parts.
   */
  protected parts(snippet: string): { text: string; mark: boolean }[] {
    return snippetParts(snippet);
  }
}
