import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth.guard';
import { de } from './core/i18n/de';
import { AdminPage } from './pages/admin/admin.page';
import { DocumentPage } from './pages/document/document.page';
import { AppLayoutPage } from './pages/layout/app-layout.page';
import { LibraryPage } from './pages/library/library.page';
import { LoginPage } from './pages/login/login.page';
import { PlaceholderPage } from './pages/placeholder/placeholder.page';
import { SettingsPage } from './pages/settings/settings.page';

/** App routes. Everything except the login page needs a session. */
export const routes: Routes = [
  { path: 'login', component: LoginPage, canActivate: [guestGuard], title: de.auth.title },
  {
    path: '',
    component: AppLayoutPage,
    canActivate: [authGuard],
    children: [
      { path: '', component: PlaceholderPage, data: { title: de.nav.newChat }, title: de.nav.newChat },
      { path: 'library', component: LibraryPage, title: de.nav.library },
      { path: 'library/:id', component: DocumentPage, title: de.nav.library },
      { path: 'settings', component: SettingsPage, title: de.nav.settings },
      { path: 'admin', component: AdminPage, canActivate: [adminGuard], title: de.nav.users },
    ],
  },
  { path: '**', redirectTo: '' },
];
