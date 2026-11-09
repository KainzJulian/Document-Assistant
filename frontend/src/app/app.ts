import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';
import { ToastComponent } from './ui/molecules/toast/toast.component';

/** Root component: the router outlet and the toast messages that float above every page. */
@Component({
  imports: [RouterOutlet, ToastComponent],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <div class="fixed right-4 bottom-4 z-50 w-[calc(100%-2rem)] max-w-sm space-y-2">
      @for (toast of toasts.toasts(); track toast.id) {
        <app-toast [tone]="toast.tone" [message]="toast.message" (dismissed)="toasts.dismiss(toast.id)" />
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
