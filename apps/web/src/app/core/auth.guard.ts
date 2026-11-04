import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../state/session.store';

/**
 * Lets logged-in users through; everyone else goes to the login page.
 * @returns True, or a redirect to `/login`.
 */
export const authGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  await session.ensureLoaded();
  return session.user() ? true : inject(Router).createUrlTree(['/login']);
};

/**
 * Lets admins through; members go back to the start page.
 * @returns True, or a redirect to `/`.
 */
export const adminGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  await session.ensureLoaded();
  return session.user()?.role === 'admin' ? true : inject(Router).createUrlTree(['/']);
};

/**
 * Keeps logged-in users away from the login page.
 * @returns True, or a redirect to `/`.
 */
export const guestGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  await session.ensureLoaded();
  return session.user() ? inject(Router).createUrlTree(['/']) : true;
};
