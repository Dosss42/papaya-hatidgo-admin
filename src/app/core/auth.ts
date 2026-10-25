import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Api, ApiError } from './api';

export interface AdminUser {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: 'passenger' | 'driver' | 'admin';
}

/** sessionStorage, not localStorage (decision #4): the token is gone when the tab closes. */
const TOKEN_KEY = 'hg_admin_token';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage blocked: the admin simply logs in again
  }
}

/**
 * Who is logged in to the admin website. Only `role = admin` may stay (decision #4): anyone else
 * is logged out at once, server side too, so no unused token is left alive.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(readToken());
  readonly user = signal<AdminUser | null>(null);
  readonly loggedIn = computed(() => !!this.token() && !!this.user());

  async login(login: string, password: string): Promise<void> {
    const res = await this.api.post<{ token: string; user: AdminUser }>('/auth/login', { login, password, device_name: 'papaya-admin-web' });
    this.setToken(res.token);
    if (res.user.role !== 'admin') {
      await this.api.post('/auth/logout').catch(() => undefined);
      this.clear();
      throw { status: 403, code: 'NOT_ADMIN', message: 'This website is for administrators. Passengers and drivers use the Papaya HatidGo app.', fieldErrors: {} } satisfies ApiError;
    }
    this.user.set(res.user);
  }

  /** After a page reload: the token survives in sessionStorage; ask the API who it belongs to. */
  async restore(): Promise<boolean> {
    if (!this.token()) return false;
    if (this.user()) return true;
    try {
      const me = await this.api.get<{ user: AdminUser }>('/auth/me');
      if (me.user.role !== 'admin') {
        this.clear();
        return false;
      }
      this.user.set(me.user);
      return true;
    } catch (e) {
      if ((e as ApiError).status === 401) this.clear();
      return false;
    }
  }

  async logout(): Promise<void> {
    await this.api.post('/auth/logout').catch(() => undefined);
    this.clear();
    void this.router.navigateByUrl('/login');
  }

  clear(): void {
    this.setToken(null);
    this.user.set(null);
  }

  private setToken(token: string | null): void {
    this.token.set(token);
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // storage blocked: the token lives in memory only
    }
  }
}

/** Adds "Authorization: Bearer …" to API calls; a 401 (expired or revoked) ends the session. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const authed = token && req.url.startsWith(inject(Api).base.replace(/\/api\/v1$/, '')) ? req.clone({ setHeaders: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }) : req.clone({ setHeaders: { Accept: 'application/json' } });
  return next(authed).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && token && !req.url.endsWith('/auth/login')) {
        auth.clear();
        void router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};

/**
 * Pages behind the login: an admin session, restored from sessionStorage after a reload.
 * Everything is inject()-ed BEFORE the first await: Angular only allows inject() synchronously
 * (after an await the injection context is gone, which left a blank page on a fresh visit).
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.restore()) ? true : router.createUrlTree(['/login']);
};

/** The login page: an admin who's already in goes straight to the dashboard. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.restore()) ? router.createUrlTree(['/']) : true;
};
