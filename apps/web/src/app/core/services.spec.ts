import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../../testing/create';
import { de } from './i18n/de';
import { ToastService } from './toast.service';
import { ThemeService } from './theme.service';
import { uploadFile } from './upload';

describe('ToastService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a message and removes it on its own (errors stay longer)', () => {
    const toast = create(ToastService, []);
    toast.show('Gespeichert.');
    toast.show('Fehler', 'danger');
    expect(toast.toasts().map((t) => t.tone)).toEqual(['success', 'danger']);
    vi.advanceTimersByTime(4001);
    expect(toast.toasts().map((t) => t.message)).toEqual(['Fehler']);
    vi.advanceTimersByTime(4000);
    expect(toast.toasts()).toEqual([]);
  });

  it('dismisses one message by id', () => {
    const toast = create(ToastService, []);
    toast.show('Eins');
    toast.show('Zwei');
    toast.dismiss(toast.toasts()[0].id);
    expect(toast.toasts().map((t) => t.message)).toEqual(['Zwei']);
  });
});

describe('ThemeService', () => {
  const classes = new Set<string>();
  const storage = new Map<string, string>();

  beforeEach(() => {
    classes.clear();
    storage.clear();
    vi.stubGlobal('document', {
      documentElement: {
        classList: {
          contains: (name: string) => classes.has(name),
          toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
        },
      },
    });
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => storage.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts with the class that index.html already set', () => {
    classes.add('dark');
    expect(create(ThemeService, []).dark()).toBe(true);
  });

  it('toggles the class and remembers the choice', () => {
    const theme = create(ThemeService, []);
    expect(theme.dark()).toBe(false);
    theme.toggle();
    expect(theme.dark()).toBe(true);
    expect(classes.has('dark')).toBe(true);
    expect(storage.get('theme')).toBe('dark');
    theme.toggle();
    expect(classes.has('dark')).toBe(false);
    expect(storage.get('theme')).toBe('light');
  });

  it('still switches when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const theme = create(ThemeService, []);
    theme.toggle();
    expect(theme.dark()).toBe(true);
  });
});

describe('uploadFile', () => {
  /** A minimal XMLHttpRequest that lets the test decide how the request ends. */
  class FakeXhr {
    static last: FakeXhr;
    status = 200;
    responseText = '';
    headers: Record<string, string> = {};
    upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    sent: FormData | null = null;
    constructor() {
      FakeXhr.last = this;
    }
    open(): void {
      // not needed
    }
    setRequestHeader(name: string, value: string): void {
      this.headers[name] = value;
    }
    send(body: FormData): void {
      this.sent = body;
    }
  }

  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXhr));
  afterEach(() => vi.unstubAllGlobals());

  const file = (): File => new File(['hallo'], 'notiz.txt');

  it('sends the file with the CSRF header and reports progress', async () => {
    const progress = vi.fn();
    const result = uploadFile(file(), progress);
    FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    FakeXhr.last.responseText = JSON.stringify([{ filename: 'notiz.txt', outcome: 'created' }]);
    FakeXhr.last.onload?.();
    expect(await result).toMatchObject({ outcome: 'created' });
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(FakeXhr.last.headers['X-Requested-With']).toBe('app');
    expect(FakeXhr.last.sent?.get('files')).toBeInstanceOf(File);
  });

  it('turns a network error into a rejected result', async () => {
    const result = uploadFile(file(), vi.fn());
    FakeXhr.last.onerror?.();
    expect(await result).toEqual({ filename: 'notiz.txt', outcome: 'rejected', message: de.errors.network });
  });

  it('reports the API message of an error answer and an expired session', async () => {
    const onUnauthorized = vi.fn();
    const result = uploadFile(file(), vi.fn(), onUnauthorized);
    FakeXhr.last.status = 401;
    FakeXhr.last.responseText = JSON.stringify({ error: { message: 'Bitte melde dich an.' } });
    FakeXhr.last.onload?.();
    expect(await result).toMatchObject({ outcome: 'rejected', message: 'Bitte melde dich an.' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('survives an answer that is not JSON', async () => {
    const result = uploadFile(file(), vi.fn());
    FakeXhr.last.status = 502;
    FakeXhr.last.responseText = '<html>Bad gateway</html>';
    FakeXhr.last.onload?.();
    expect(await result).toMatchObject({ outcome: 'rejected', message: de.errors.unknown });
  });
});
