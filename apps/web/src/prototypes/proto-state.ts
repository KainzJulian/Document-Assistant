import { Injectable, signal } from '@angular/core';

/** Screens every prototype variant can show. */
export type ProtoScreen = 'new' | 'library' | 'chat' | 'settings';

const SCREENS: readonly ProtoScreen[] = ['new', 'library', 'chat', 'settings'];

/**
 * State shared by all prototype variants, so switching the variant keeps the screen,
 * the open dialog and the theme.
 *
 * Query parameters for quick links: `?screen=chat`, `?open=1` (Ollama dialog),
 * `?theme=dark|light`.
 */
@Injectable({ providedIn: 'root' })
export class ProtoState {
  /** Screen on display. */
  readonly screen = signal<ProtoScreen>('new');
  /** Whether the Ollama warning dialog is open. */
  readonly dialogOpen = signal(false);
  /** Whether the history panel is open (variants with a top bar). */
  readonly historyOpen = signal(false);
  /** Whether the mobile drawer is open. */
  readonly drawerOpen = signal(false);
  /** Ids of the documents selected for the chat. */
  readonly selectedIds = signal<string[]>(['d1', 'd3']);
  /** Citation shown in the source panel (null = none). */
  readonly citation = signal<number | null>(1);
  /** Model in use. */
  readonly modelId = signal('m4');
  /** Ollama model waiting for the warning dialog's answer. */
  readonly pendingModelId = signal('m1');
  /** Whether the dark theme is on. */
  readonly dark = signal(false);

  constructor() {
    const params = new URL(location.href).searchParams;
    const screen = params.get('screen') as ProtoScreen | null;
    if (screen && SCREENS.includes(screen)) this.screen.set(screen);
    if (params.get('open') === '1') this.dialogOpen.set(true);
    const theme = params.get('theme');
    if (theme) document.documentElement.classList.toggle('dark', theme === 'dark');
    this.dark.set(document.documentElement.classList.contains('dark'));
  }

  /**
   * Go to a screen and close the drawer.
   * @param screen - Target screen.
   */
  go(screen: ProtoScreen): void {
    this.screen.set(screen);
    this.drawerOpen.set(false);
  }

  /**
   * Add or remove a document from the selection.
   * @param id - Document id.
   */
  toggleDoc(id: string): void {
    this.selectedIds.update((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  /**
   * Whether a document is selected for the chat.
   * @param id - Document id.
   * @returns True if selected.
   */
  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  /** Switch between light and dark theme. */
  toggleTheme(): void {
    const dark = !this.dark();
    document.documentElement.classList.toggle('dark', dark);
    this.dark.set(dark);
  }
}
