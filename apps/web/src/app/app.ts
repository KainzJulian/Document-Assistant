import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root component. Hosts the router outlet; layout lives in the app-shell template. */
@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {}
