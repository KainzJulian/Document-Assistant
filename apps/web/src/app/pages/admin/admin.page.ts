import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiClient, ApiRequestError, User, UserCreate, UserPatch } from '../../core/api';
import { de } from '../../core/i18n/de';
import { ToastService } from '../../core/toast.service';
import { SessionStore } from '../../state/session.store';
import { BadgeComponent } from '../../ui/atoms/badge/badge.component';
import { ButtonComponent } from '../../ui/atoms/button/button.component';
import { InputComponent } from '../../ui/atoms/input/input.component';
import { DialogComponent } from '../../ui/organisms/dialog/dialog.component';

/** Admin page: create household accounts, reset passwords, disable and enable users. */
@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputComponent, ButtonComponent, BadgeComponent, DialogComponent],
  template: `
    <div class="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 class="text-3xl font-semibold tracking-tight">{{ t.admin.title }}</h1>
      <p class="mt-2 text-muted">{{ t.admin.intro }}</p>

      <section aria-labelledby="admin-create" class="mt-8 rounded-card border border-border bg-surface p-6">
        <h2 id="admin-create" class="mb-4 text-xl font-semibold">{{ t.admin.createTitle }}</h2>
        <form class="space-y-4" (submit)="create($event)">
          <div class="grid gap-4 sm:grid-cols-2">
            <app-input [label]="t.admin.username" [(value)]="newUsername" autocomplete="off" [required]="true" />
            <app-input [label]="t.admin.displayName" [(value)]="newDisplayName" autocomplete="off" [required]="true" />
          </div>
          <app-input [label]="t.admin.password" [(value)]="newPassword" type="password" autocomplete="new-password" [hint]="t.admin.passwordHint" [error]="createError()" [required]="true" />
          <label class="flex min-h-10 cursor-pointer items-center gap-3 text-sm pointer-coarse:min-h-11">
            <input type="checkbox" class="size-4 accent-primary" [checked]="newIsAdmin()" (change)="newIsAdmin.set(!newIsAdmin())" />
            {{ t.admin.isAdmin }}
          </label>
          <app-button type="submit" variant="primary" [loading]="creating()">{{ t.admin.create }}</app-button>
        </form>
      </section>

      <section aria-labelledby="admin-list" class="mt-10">
        <h2 id="admin-list" class="mb-3 text-xl font-semibold">{{ t.admin.listTitle }}</h2>
        <ul class="divide-y divide-border border-y border-border">
          @for (u of users(); track u.id) {
            <li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ u.display_name }} @if (u.id === me()?.id) { <span class="font-normal text-muted">({{ t.admin.you }})</span> }</p>
                <p class="text-sm text-muted">{{ u.username }}</p>
              </div>
              <app-badge [tone]="u.role === 'admin' ? 'success' : 'neutral'">{{ u.role === 'admin' ? t.admin.roleAdmin : t.admin.roleMember }}</app-badge>
              @if (u.disabled) { <app-badge tone="danger">{{ t.admin.disabled }}</app-badge> }
              <span class="flex gap-1">
                <app-button size="sm" (click)="openReset(u)">{{ t.admin.resetPassword }}</app-button>
                @if (u.id !== me()?.id) {
                  <app-button size="sm" variant="quiet" (click)="toggleDisabled(u)">{{ u.disabled ? t.admin.enable : t.admin.disable }}</app-button>
                }
              </span>
            </li>
          }
        </ul>
      </section>
    </div>

    <app-dialog [(open)]="resetOpen" [title]="t.admin.resetPassword" [description]="resetUser()?.display_name ?? ''">
      <form id="reset-form" (submit)="resetPassword($event)">
        <app-input [label]="t.admin.newPassword" [(value)]="resetValue" type="password" autocomplete="new-password" [hint]="t.admin.passwordHint" [error]="resetError()" [required]="true" />
      </form>
      <ng-container dialog-actions>
        <app-button (click)="resetOpen.set(false)">{{ t.common.cancel }}</app-button>
        <app-button variant="primary" [loading]="resetting()" (click)="resetPassword()">{{ t.common.save }}</app-button>
      </ng-container>
    </app-dialog>
  `,
})
export class AdminPage {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  protected readonly t = de;
  protected readonly me = inject(SessionStore).user;

  protected readonly users = signal<User[]>([]);

  protected readonly newUsername = signal('');
  protected readonly newDisplayName = signal('');
  protected readonly newPassword = signal('');
  protected readonly newIsAdmin = signal(false);
  protected readonly createError = signal('');
  protected readonly creating = signal(false);

  protected readonly resetOpen = signal(false);
  protected readonly resetUser = signal<User | null>(null);
  protected readonly resetValue = signal('');
  protected readonly resetError = signal('');
  protected readonly resetting = signal(false);

  constructor() {
    void this.load();
  }

  /** Load all users. */
  private async load(): Promise<void> {
    try {
      this.users.set(await this.api.get<User[]>('/users'));
    } catch (e) {
      this.fail(e);
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
   * Create the user from the form.
   * @param event - The form submit event.
   */
  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    this.createError.set('');
    this.creating.set(true);
    const body: UserCreate = {
      username: this.newUsername().trim(),
      display_name: this.newDisplayName().trim(),
      password: this.newPassword(),
      role: this.newIsAdmin() ? 'admin' : 'member',
    };
    try {
      await this.api.post<User>('/users', body);
      this.toast.show(de.admin.created);
      this.newUsername.set('');
      this.newDisplayName.set('');
      this.newPassword.set('');
      this.newIsAdmin.set(false);
      await this.load();
    } catch (e) {
      this.createError.set(e instanceof ApiRequestError ? e.message : de.errors.unknown);
    } finally {
      this.creating.set(false);
    }
  }

  /**
   * Open the password reset dialog.
   * @param user - The user whose password is reset.
   */
  protected openReset(user: User): void {
    this.resetUser.set(user);
    this.resetValue.set('');
    this.resetError.set('');
    this.resetOpen.set(true);
  }

  /**
   * Save the new password.
   * @param event - The form submit event, if the form was submitted with Enter.
   */
  protected async resetPassword(event?: Event): Promise<void> {
    event?.preventDefault();
    const user = this.resetUser();
    if (!user) return;
    this.resetError.set('');
    this.resetting.set(true);
    try {
      const body: UserPatch = { password: this.resetValue() };
      await this.api.patch<User>(`/users/${user.id}`, body);
      this.resetOpen.set(false);
      this.toast.show(de.admin.resetDone);
    } catch (e) {
      this.resetError.set(e instanceof ApiRequestError ? e.message : de.errors.unknown);
    } finally {
      this.resetting.set(false);
    }
  }

  /**
   * Disable or enable a user.
   * @param user - The user to change.
   */
  protected async toggleDisabled(user: User): Promise<void> {
    try {
      const body: UserPatch = { disabled: !user.disabled };
      await this.api.patch<User>(`/users/${user.id}`, body);
      this.toast.show(de.admin.updated);
      await this.load();
    } catch (e) {
      this.fail(e);
    }
  }
}
