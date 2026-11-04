import { Injectable, signal } from '@angular/core';

/**
 * Light and dark theme. The first paint is handled in index.html; this service keeps the
 * `dark` class on `<html>` and the saved choice in sync afterwards.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** True while the dark theme is on. */
  readonly dark = signal(document.documentElement.classList.contains('dark'));

  /** Switch between light and dark and remember the choice. */
  toggle(): void {
    const dark = !this.dark();
    document.documentElement.classList.toggle('dark', dark);
    this.dark.set(dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // INFO: Private mode may block storage; the theme then only lasts for this visit.
    }
  }
}
