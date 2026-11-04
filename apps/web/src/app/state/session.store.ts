import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient, ApiRequestError, LoginRequest, User } from '../core/api';

/** Who is logged in. Loaded once on start from the session cookie. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private loading: Promise<void> | null = null;

  /** The logged-in user, or null. */
  readonly user = signal<User | null>(null);
  /** True once the first check of the session cookie is done. */
  readonly loaded = signal(false);

  constructor() {
    this.api.onUnauthorized = () => {
      this.user.set(null);
      void this.router.navigate(['/login']);
    };
  }

  /**
   * Make sure the session was checked at least once (used by route guards).
   * @returns A promise that resolves when `user` and `loaded` are set.
   */
  ensureLoaded(): Promise<void> {
    if (this.loaded()) return Promise.resolve();
    this.loading ??= this.api
      .get<User>('/auth/me')
      .then((user) => this.user.set(user))
      .catch((error: unknown) => {
        if (!(error instanceof ApiRequestError) || error.status !== 401) throw error;
        this.user.set(null);
      })
      .finally(() => {
        this.loaded.set(true);
        this.loading = null;
      });
    return this.loading;
  }

  /**
   * Log in.
   * @param credentials - Username and password.
   * @throws {ApiRequestError} With a German message for wrong credentials or a lockout.
   */
  async login(credentials: LoginRequest): Promise<void> {
    this.user.set(await this.api.post<User>('/auth/login', credentials));
    this.loaded.set(true);
  }

  /** Log out and go to the login page. */
  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } finally {
      this.user.set(null);
      await this.router.navigate(['/login']);
    }
  }
}
