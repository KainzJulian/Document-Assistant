import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../state/session.store';

// NOTE: Dependencies are injected before the first await: inject() only works while Angular
// is still synchronously running the guard.

/**
 * Lets logged-in users through; everyone else goes to the login page.
 * @returns True, or a redirect to `/login`.
 */
export const authGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.ensureLoaded();
  return session.user() ? true : router.createUrlTree(['/login']);
};

/**
 * Lets admins through; members go back to the start page.
 * @returns True, or a redirect to `/`.
 */
export const adminGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.ensureLoaded();
  return session.user()?.role === 'admin' ? true : router.createUrlTree(['/']);
};

/**
 * Keeps logged-in users away from the login page.
 * @returns True, or a redirect to `/`.
 */
export const guestGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.ensureLoaded();
  return session.user() ? router.createUrlTree(['/']) : true;
};
