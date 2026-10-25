import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** The admin website's root: the router decides between the login page and the Shell. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
