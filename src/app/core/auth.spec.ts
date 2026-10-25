import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { ApiError } from './api';
import { AuthService, authInterceptor } from './auth';

const api = environment.apiUrl;
const settle = () => new Promise((r) => setTimeout(r));

describe('AuthService (admin only)', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('lets an admin in and keeps the token in sessionStorage (gone with the tab)', async () => {
    const done = auth.login('admin@example.test', 'password');
    http.expectOne(`${api}/auth/login`).flush({ token: 'tok-admin', user: { id: 1, full_name: 'Ana Reyes', role: 'admin' } });
    await done;
    expect(auth.loggedIn()).toBe(true);
    expect(sessionStorage.getItem('hg_admin_token')).toBe('tok-admin');
    expect(globalThis.localStorage?.getItem('hg_admin_token') ?? null).toBeNull(); // never localStorage
  });

  it('refuses a passenger or driver and revokes their token on the server', async () => {
    const done = auth.login('pasahero1@example.test', 'password');
    http.expectOne(`${api}/auth/login`).flush({ token: 'tok-pax', user: { id: 2, full_name: 'Maria', role: 'passenger' } });
    await settle();
    const logout = http.expectOne(`${api}/auth/logout`);
    expect(logout.request.headers.get('Authorization')).toBe('Bearer tok-pax'); // the token itself is revoked
    logout.flush(null);
    const error = (await done.catch((e) => e)) as ApiError;
    expect(error.code).toBe('NOT_ADMIN');
    expect(auth.loggedIn()).toBe(false);
    expect(sessionStorage.getItem('hg_admin_token')).toBeNull();
  });

  it('a 401 on any call ends the session', async () => {
    sessionStorage.setItem('hg_admin_token', 'tok-old');
    const fresh = TestBed.inject(AuthService);
    fresh.token.set('tok-old');
    const restoring = fresh.restore();
    http.expectOne(`${api}/auth/me`).flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });
    expect(await restoring).toBe(false);
    expect(fresh.token()).toBeNull();
  });
});
