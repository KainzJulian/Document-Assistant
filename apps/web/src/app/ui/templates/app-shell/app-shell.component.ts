import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { de } from '../../../core/i18n/de';
import { InputComponent } from '../../atoms/input/input.component';

const NAV_LINK =
  'flex min-h-10 w-full cursor-pointer items-center rounded-control px-3 text-sm transition-colors hover:bg-surface-muted pointer-coarse:min-h-11';

/**
 * App frame: sidebar (fixed 280 px from 1024 px up, a drawer with a menu button below) and
 * the page in the main area.
 *
 * Sidebar order: new chat, library, settings, chat search, chat list, user. The chat list and
 * search come alive in a later version; they are shown now so the layout is final.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, InputComponent],
  host: { '(document:keydown.escape)': 'closeDrawer()', class: 'block' },
  template: `
    <div class="flex h-dvh bg-background text-foreground">
      @if (drawerOpen()) {
        <button type="button" tabindex="-1" class="fixed inset-0 z-30 bg-overlay lg:hidden" [attr.aria-label]="t.nav.close" (click)="closeDrawer()"></button>
      }

      <aside
        [attr.aria-label]="t.nav.sidebar"
        class="fixed inset-y-0 left-0 z-40 flex w-70 flex-col border-r border-border bg-surface transition-transform duration-200 lg:visible lg:static lg:translate-x-0"
        [class]="drawerOpen() ? 'translate-x-0' : '-translate-x-full invisible'"
      >
        <div class="flex items-center justify-between px-5 pt-6 pb-4">
          <span class="text-lg font-semibold">{{ t.app.name }}</span>
          <button type="button" class="min-h-10 cursor-pointer px-2 text-sm text-muted hover:text-foreground lg:hidden" (click)="closeDrawer()">{{ t.nav.close }}</button>
        </div>

        <div class="px-3">
          <a routerLink="/" class="inline-flex min-h-10 w-full items-center justify-center rounded-control bg-primary px-4 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 pointer-coarse:min-h-11" (click)="closeDrawer()">{{ t.nav.newChat }}</a>
        </div>

        <nav [attr.aria-label]="t.nav.sections" class="mt-3 space-y-0.5 px-3">
          <a routerLink="/library" routerLinkActive="bg-primary-soft font-medium text-primary" [class]="navLink" (click)="closeDrawer()">{{ t.nav.library }}</a>
          <a routerLink="/settings" routerLinkActive="bg-primary-soft font-medium text-primary" [class]="navLink" (click)="closeDrawer()">{{ t.nav.settings }}</a>
          @if (isAdmin()) {
            <a routerLink="/admin" routerLinkActive="bg-primary-soft font-medium text-primary" [class]="navLink" (click)="closeDrawer()">{{ t.nav.users }}</a>
          }
        </nav>

        <div class="mx-3 mt-4">
          <app-input [label]="t.nav.searchChats" [hideLabel]="true" type="search" [placeholder]="t.nav.searchChats" [disabled]="true" />
        </div>
        <p class="min-h-0 flex-1 overflow-y-auto px-5 pt-4 text-sm text-muted">{{ t.nav.noChats }}</p>

        <div class="flex items-center justify-between gap-2 border-t border-border px-5 py-4 text-sm">
          <span class="min-w-0 truncate font-medium">{{ userName() }}</span>
          <span class="flex shrink-0 gap-1 text-muted">
            <button type="button" class="min-h-9 cursor-pointer rounded-control px-2 hover:text-foreground pointer-coarse:min-h-11" (click)="themeToggle.emit()">{{ dark() ? t.nav.themeLight : t.nav.themeDark }}</button>
            <button type="button" class="min-h-9 cursor-pointer rounded-control px-2 hover:text-foreground pointer-coarse:min-h-11" (click)="logout.emit()">{{ t.nav.logout }}</button>
          </span>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 lg:hidden">
          <button type="button" class="min-h-10 cursor-pointer rounded-control px-2 text-sm font-medium hover:bg-surface-muted pointer-coarse:min-h-11" (click)="drawerOpen.set(true)">{{ t.nav.menu }}</button>
          <span class="font-semibold">{{ t.app.name }}</span>
        </header>
        <main class="min-h-0 flex-1 overflow-y-auto"><ng-content /></main>
      </div>
    </div>
  `,
})
export class AppShellComponent {
  protected readonly t = de;
  protected readonly navLink = NAV_LINK;
  protected readonly drawerOpen = signal(false);

  /** Name of the logged-in person. */
  readonly userName = input.required<string>();
  /** Shows the admin entry "Benutzer". */
  readonly isAdmin = input(false);
  /** Whether the dark theme is on (decides the label of the theme link). */
  readonly dark = input(false);
  /** Emits when "Abmelden" is pressed. */
  readonly logout = output<void>();
  /** Emits when the theme link is pressed. */
  readonly themeToggle = output<void>();

  /** Close the mobile drawer. */
  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }
}
