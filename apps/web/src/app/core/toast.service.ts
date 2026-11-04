import { Injectable, signal } from '@angular/core';

/** Colour meaning of a toast. */
export type ToastTone = 'success' | 'danger';

/** One message on screen. */
export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

/** Short messages that disappear on their own (errors stay a little longer). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  /** Messages currently on screen. */
  readonly toasts = signal<Toast[]>([]);

  /**
   * Show a message.
   * @param message - German text.
   * @param tone - `success` (default) or `danger`.
   */
  show(message: string, tone: ToastTone = 'success'): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, tone, message }]);
    setTimeout(() => this.dismiss(id), tone === 'danger' ? 8000 : 4000);
  }

  /**
   * Remove a message.
   * @param id - Id of the toast.
   */
  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
