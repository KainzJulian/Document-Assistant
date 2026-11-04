import { Component, isDevMode } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrototypesHost } from '../prototypes/prototypes-host';

/** Root component. Hosts the router outlet; layout lives in the app-shell template. */
@Component({
  imports: [RouterOutlet, PrototypesHost],
  selector: 'app-root',
  // INFO: Temporary. In development the shell prototypes replace the router until a design is chosen.
  template: `@if (prototypes) {
    <app-prototypes />
  } @else {
    <router-outlet />
  }`,
})
export class App {
  protected readonly prototypes = isDevMode();
}
