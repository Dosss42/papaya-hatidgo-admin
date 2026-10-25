import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

/** Every API failure in ONE shape (the same as the mobile app's): show `message`, branch on `code`. */
export interface ApiError {
  status: number; // 0 = no answer (server down, no internet)
  code: string; // e.g. NOT_ADMIN, VALIDATION_FAILED, PLAN_IN_USE
  message: string;
  fieldErrors: Record<string, string>; // first message per field
}

/** A list endpoint's paging info (Laravel paginate()). */
export interface Page {
  current_page: number;
  last_page: number;
  total: number;
}

export type Params = Record<string, string | number | boolean | null | undefined>;

export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return { status: 0, code: 'NETWORK', message: "Can't reach the server. Check that the API is running and try again.", fieldErrors: {} };
    }
    const body = (err.error ?? {}) as { message?: string; code?: string; errors?: Record<string, string[]> };
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(body.errors ?? {})) fieldErrors[field] = messages[0];
    return { status: err.status, code: body.code ?? 'HTTP_ERROR', message: body.message ?? 'Something went wrong.', fieldErrors };
  }
  if (err instanceof Error && err.name === 'TimeoutError') {
    return { status: 0, code: 'TIMEOUT', message: 'The server took too long. Try again.', fieldErrors: {} };
  }
  if (typeof err === 'object' && err && 'code' in err && 'message' in err) return err as ApiError;
  return { status: 0, code: 'UNKNOWN', message: 'Something went wrong.', fieldErrors: {} };
}

/**
 * The admin website's only door to the API (/api/v1). Pages call these and get the parsed body
 * or an ApiError; the Bearer token is added by authInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  readonly base = environment.apiUrl;

  get<T>(path: string, params?: Params): Promise<T> {
    return this.run(this.http.get<T>(this.base + path, { params: this.params(params) }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.run(this.http.post<T>(this.base + path, body));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.run(this.http.patch<T>(this.base + path, body));
  }

  /** A private file (a driver's document photo), streamed with the token: never a public URL. */
  blob(path: string): Promise<Blob> {
    const url = path.startsWith('http') ? path : path.startsWith('/api/') ? this.base.replace(/\/api\/v1$/, '') + path : this.base + path;
    return this.run(this.http.get(url, { responseType: 'blob' }), 60_000);
  }

  private params(params?: Params): HttpParams {
    let p = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== null && value !== undefined && value !== '') p = p.set(key, String(value));
    }
    return p;
  }

  private async run<T>(request: Observable<T>, ms = 20_000): Promise<T> {
    try {
      return await firstValueFrom(request.pipe(timeout(ms)));
    } catch (err) {
      throw toApiError(err);
    }
  }
}
