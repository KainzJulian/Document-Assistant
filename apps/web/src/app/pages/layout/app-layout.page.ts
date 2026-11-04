import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import { SessionStore } from '../../state/session.store';
import { AppShellComponent } from '../../ui/templates/app-shell/app-shell.component';

/** Frame for every page after login: the app shell wired to the session and the theme. */
@Component({
  selector: 'app-layout-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppShellComponent, RouterOutlet],
  template: `
    <app-shell
      [userName]="session.user()?.display_name ?? ''"
      [isAdmin]="session.user()?.role === 'admin'"
      [dark]="theme.dark()"
      (logout)="session.logout()"
      (themeToggle)="theme.toggle()"
    >
      <router-outlet />
    </app-shell>
  `,
})
export class AppLayoutPage {
  protected readonly session = inject(SessionStore);
  protected readonly theme = inject(ThemeService);
}
