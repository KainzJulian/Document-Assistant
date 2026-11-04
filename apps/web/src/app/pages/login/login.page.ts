import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiRequestError } from '../../core/api';
import { de } from '../../core/i18n/de';
import { SessionStore } from '../../state/session.store';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { InputComponent } from '../../ui/atoms/input/input.component';

/** Login page: username and password. Shows the server's German message on failure. */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputComponent, ButtonComponent],
  template: `
    <main class="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <div class="w-full max-w-sm">
        <p class="mb-6 text-center text-lg font-semibold">{{ t.app.name }}</p>
        <form class="space-y-5 rounded-card border border-border bg-surface p-6 shadow-md" (submit)="submit($event)">
          <h1 class="text-2xl font-semibold tracking-tight">{{ t.auth.title }}</h1>
          <app-input [label]="t.auth.username" [(value)]="username" autocomplete="username" [required]="true" [autofocus]="true" />
          <app-input [label]="t.auth.password" [(value)]="password" type="password" autocomplete="current-password" [required]="true" />
          @if (error()) {
            <p role="alert" class="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{{ error() }}</p>
          }
          <app-button type="submit" variant="primary" [block]="true" [loading]="busy()">{{ t.auth.submit }}</app-button>
        </form>
      </div>
    </main>
  `,
})
export class LoginPage {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly t = de;

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  /**
   * Send the credentials and go to the start page on success.
   * @param event - The form submit event.
   */
  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.error.set('');
    this.busy.set(true);
    try {
      await this.session.login({ username: this.username().trim(), password: this.password() });
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(e instanceof ApiRequestError ? e.message : de.errors.unknown);
      this.password.set('');
    } finally {
      this.busy.set(false);
    }
  }
}
