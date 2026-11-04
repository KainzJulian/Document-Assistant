import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth.guard';
import { de } from './core/i18n/de';
import { AdminPage } from './pages/admin/admin.page';
import { AppLayoutPage } from './pages/layout/app-layout.page';
import { LoginPage } from './pages/login/login.page';
import { PlaceholderPage } from './pages/placeholder/placeholder.page';

/** App routes. Everything except the login page needs a session. */
export const routes: Routes = [
  { path: 'login', component: LoginPage, canActivate: [guestGuard], title: de.auth.title },
  {
    path: '',
    component: AppLayoutPage,
    canActivate: [authGuard],
    children: [
      { path: '', component: PlaceholderPage, data: { title: de.nav.newChat }, title: de.nav.newChat },
      { path: 'library', component: PlaceholderPage, data: { title: de.nav.library }, title: de.nav.library },
      { path: 'settings', component: PlaceholderPage, data: { title: de.nav.settings }, title: de.nav.settings },
      { path: 'admin', component: AdminPage, canActivate: [adminGuard], title: de.nav.users },
    ],
  },
  { path: '**', redirectTo: '' },
];
