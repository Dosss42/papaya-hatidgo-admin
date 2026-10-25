import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, ApiError, Page } from '../core/api';
import { Chip } from '../shared/chip';
import { dateOnly } from '../shared/format';
import { Pager } from '../shared/pager';
import { ReasonDialog } from '../shared/reason-dialog';

interface UserRow {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: 'passenger' | 'driver' | 'admin';
  account_status: 'active' | 'suspended';
  created_at: string | null;
  driver: { id: number; compliance_status: string; is_online: boolean } | null;
}

/**
 * Users (Phase 14 step 14.4): find anyone by name, email or phone; suspend (with a reason the
 * person reads) or reactivate. A suspended driver is taken offline; a suspended passenger can't
 * book. Admin accounts aren't changed here. Every change goes to the audit log.
 */
@Component({
  selector: 'hg-users',
  imports: [FormsModule, Chip, Pager, ReasonDialog],
  template: `
    <div class="grid gap-5">
      <header>
        <h1 class="text-3xl font-extrabold">Users</h1>
        <p class="text-ink-soft">Passengers and drivers. Suspending someone stops them booking or driving until you reactivate them.</p>
      </header>

      <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); load(1)" role="search">
        <label class="field min-w-64 flex-1">
          <span class="field-label">Search</span>
          <input class="input" name="q" [(ngModel)]="q" placeholder="Name, email or mobile number" />
        </label>
        <label class="field">
          <span class="field-label">Role</span>
          <select class="input" name="role" [(ngModel)]="role" (ngModelChange)="load(1)">
            <option value="">All</option><option value="passenger">Passengers</option><option value="driver">Drivers</option><option value="admin">Admins</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Account</span>
          <select class="input" name="status" [(ngModel)]="status" (ngModelChange)="load(1)">
            <option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </select>
        </label>
        <button type="submit" class="btn btn-primary">Search</button>
      </form>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }
      @if (done(); as message) {
        <p class="notice-ok" role="status"><span aria-hidden="true">✓</span> {{ message }}</p>
      }

      <div class="overflow-x-auto rounded-hg ring-2 ring-line">
        <table class="table">
          <thead><tr><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Role</th><th scope="col">Account</th><th scope="col">Joined</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (u of rows(); track u.id) {
              <tr>
                <td class="font-bold">{{ u.full_name }}</td>
                <td>{{ u.email }}<br /><span class="text-ink-soft">{{ u.phone }}</span></td>
                <td>
                  {{ u.role === 'passenger' ? 'Passenger' : u.role === 'driver' ? 'Driver' : 'Admin' }}
                  @if (u.driver; as d) {
                    <div class="mt-1 flex flex-wrap gap-1">
                      <hg-chip [status]="d.compliance_status" />
                      @if (d.is_online) {
                        <span class="chip chip-active">Online</span>
                      }
                    </div>
                  }
                </td>
                <td><hg-chip [status]="u.account_status" /></td>
                <td>{{ dateOnly(u.created_at) }}</td>
                <td class="text-right">
                  @if (u.role !== 'admin') {
                    @if (u.account_status === 'active') {
                      <button type="button" class="btn btn-outline !text-alert !ring-alert" (click)="target.set(u)">Suspend</button>
                    } @else {
                      <button type="button" class="btn btn-outline" (click)="reactivate(u)" [disabled]="busy()">Reactivate</button>
                    }
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="text-ink-soft">{{ loading() ? 'Loading…' : 'No users match.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <hg-pager [page]="page()" (go)="load($event)" />
    </div>

    <hg-reason-dialog [open]="target() !== null" [heading]="'Suspend ' + (target()?.full_name ?? '') + '?'"
      [message]="target()?.role === 'driver' ? 'They are taken offline at once and can\\'t go online until reactivated.' : 'They can\\'t book rides until reactivated.'"
      confirmLabel="Suspend" [danger]="true" reasonLabel="Reason (kept in the audit log)" reasonHint="Write what happened, for whoever reads the log later."
      [busy]="busy()" [error]="dialogError()" (confirmed)="suspend($event)" (closed)="target.set(null); dialogError.set(null)" />
  `,
})
export class UsersPage {
  private readonly api = inject(Api);
  protected readonly rows = signal<UserRow[]>([]);
  protected readonly page = signal<Page | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  protected readonly target = signal<UserRow | null>(null);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal<string | null>(null);
  protected q = '';
  protected role = '';
  protected status = '';
  protected readonly dateOnly = dateOnly;

  constructor() {
    void this.load(1);
  }

  protected async load(page: number): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.get<{ data: UserRow[]; meta: Page }>('/admin/users', { q: this.q.trim(), role: this.role, status: this.status, page });
      this.rows.set(res.data);
      this.page.set(res.meta);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as ApiError).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async suspend(reason: string): Promise<void> {
    const u = this.target();
    if (!u || this.busy()) return;
    this.busy.set(true);
    try {
      const res = await this.api.patch<{ data: UserRow }>(`/admin/users/${u.id}/status`, { status: 'suspended', reason });
      this.replace(res.data);
      this.target.set(null);
      this.done.set(`${u.full_name} is suspended.`);
    } catch (e) {
      this.dialogError.set((e as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async reactivate(u: UserRow): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.patch<{ data: UserRow }>(`/admin/users/${u.id}/status`, { status: 'active' });
      this.replace(res.data);
      this.done.set(`${u.full_name} is active again.`);
    } catch (e) {
      this.error.set((e as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }

  private replace(row: UserRow): void {
    this.rows.update((list) => list.map((r) => (r.id === row.id ? row : r)));
  }
}
