import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ApiError } from '../core/api';
import { AuthService } from '../core/auth';
import { TRICYCLE_SVG } from '../shared/tricycle';

/** Admin login (decision #4): the same /auth/login as the app, but only administrators get in. */
@Component({
  selector: 'hg-login',
  imports: [FormsModule],
  template: `
    <main class="grid min-h-dvh place-items-center bg-surface px-4">
      <form class="card grid w-full max-w-md gap-5 p-8" (submit)="$event.preventDefault(); submit()">
        <div class="flex items-center gap-3">
          <span class="grid size-14 place-items-center rounded-full bg-papaya-tint text-papaya [&_svg]:size-9" [innerHTML]="logo"></span>
          <div>
            <p class="text-xl font-extrabold leading-tight">Papaya HatidGo</p>
            <p class="text-ink-soft">Admin</p>
          </div>
        </div>
        <h1 class="text-2xl font-extrabold">Log in</h1>

        <label class="field">
          <span class="field-label">Email or mobile number</span>
          <input class="input" name="login" autocomplete="username" [(ngModel)]="login" required [class.input-error]="!!fieldErrors()['login']" />
          @if (fieldErrors()['login']; as e) {
            <span class="text-alert">{{ e }}</span>
          }
        </label>
        <label class="field">
          <span class="field-label">Password</span>
          <input class="input" name="password" type="password" autocomplete="current-password" [(ngModel)]="password" required />
        </label>

        @if (error(); as message) {
          <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
        }

        <button type="submit" class="btn btn-primary w-full" [disabled]="busy() || !login || !password">{{ busy() ? 'Logging in…' : 'Log in' }}</button>
        <p class="text-ink-soft">For Papaya HatidGo administrators only.</p>
      </form>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly logo = inject(DomSanitizer).bypassSecurityTrustHtml(TRICYCLE_SVG); // our own constant, not user input

  protected login = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    try {
      await this.auth.login(this.login.trim(), this.password);
      void this.router.navigateByUrl('/');
    } catch (e) {
      const err = e as ApiError;
      this.error.set(err.message);
      this.fieldErrors.set(err.fieldErrors ?? {});
    } finally {
      this.busy.set(false);
    }
  }
}
