import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, ApiError, Page } from '../core/api';
import { dateTime } from '../shared/format';
import { Pager } from '../shared/pager';

interface Log {
  id: number;
  action: string;
  actor: { id: number; full_name: string; role: string } | null;
  subject: { type: string; id: number };
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
}

/** Plain words for the recorded actions; anything new still shows its code. */
const ACTIONS: Record<string, string> = {
  'driver_document.approved': 'Approved a paper',
  'driver_document.rejected': 'Rejected a paper',
  'driver_document.resubmission_requested': 'Asked for a new photo',
  'driver.suspended': 'Suspended a driver',
  'driver.reactivated': 'Reactivated a driver',
  'user.suspended': 'Suspended a passenger',
  'user.reactivated': 'Reactivated a passenger',
  'fare.created': 'Saved a new fare',
  'setting.changed': 'Changed a setting',
  'plan.created': 'Added a plan',
  'plan.updated': 'Changed a plan',
  'requirement.created': 'Added a requirement',
  'requirement.updated': 'Changed a requirement',
  'ride.cancelled_by_admin': 'Cancelled a ride',
  'ride.ended_at_destination': 'Ride ended at the destination',
  'subscription.activated': 'Activated a subscription',
  'subscription.payment_rejected': 'A payment was refused',
  'driver_document.expired': 'A paper expired (system)',
  'driver_document.file_viewed': "Opened a paper's photo",
};

/**
 * The audit log (phase-0 § K): every admin write, plus system actions on papers and subscriptions,
 * newest first. Read-only: nothing here can be changed or deleted, by anyone.
 */
@Component({
  selector: 'hg-audit',
  imports: [FormsModule, Pager],
  template: `
    <div class="grid gap-5">
      <header>
        <h1 class="text-3xl font-extrabold">Audit log</h1>
        <p class="text-ink-soft">Who did what, when, and what changed. It can't be edited or deleted.</p>
      </header>

      <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); load(1)">
        <label class="field"><span class="field-label">What</span>
          <select class="input" name="action" [(ngModel)]="action" (ngModelChange)="load(1)">
            <option value="">Everything</option>
            <option value="driver_document.">Papers</option>
            <option value="driver.">Drivers</option>
            <option value="user.">Passengers</option>
            <option value="fare.">Fares</option>
            <option value="setting.">Settings</option>
            <option value="plan.">Plans</option>
            <option value="subscription.">Subscriptions</option>
            <option value="requirement.">Requirements</option>
            <option value="ride.">Rides</option>
          </select>
        </label>
        <label class="field"><span class="field-label">From</span><input class="input" type="date" name="from" [(ngModel)]="from" /></label>
        <label class="field"><span class="field-label">To</span><input class="input" type="date" name="to" [(ngModel)]="to" /></label>
        <button type="submit" class="btn btn-outline">Filter</button>
      </form>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }

      <div class="overflow-x-auto rounded-hg ring-2 ring-line">
        <table class="table">
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Changes</th></tr></thead>
          <tbody>
            @for (log of rows(); track log.id) {
              <tr>
                <td class="whitespace-nowrap">{{ dateTime(log.created_at) }}</td>
                <td>{{ log.actor?.full_name ?? 'System' }}@if (log.actor) {<br /><span class="text-ink-soft">{{ log.actor.role }}</span>}</td>
                <td><span class="font-bold">{{ label(log.action) }}</span><br /><span class="text-ink-soft">{{ log.subject.type }} #{{ log.subject.id }}</span></td>
                <td>
                  @for (c of changes(log); track c.key) {
                    <p><span class="text-ink-soft">{{ c.key }}:</span>
                      @if (c.old !== undefined) {<del class="text-ink-soft">{{ c.old }}</del> → }<strong>{{ c.new }}</strong></p>
                  } @empty {
                    <span class="text-ink-soft">—</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="text-ink-soft">Nothing recorded for these filters.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <hg-pager [page]="page()" (go)="load($event)" />
    </div>
  `,
})
export class AuditPage {
  private readonly api = inject(Api);
  protected readonly rows = signal<Log[]>([]);
  protected readonly page = signal<Page | null>(null);
  protected readonly error = signal<string | null>(null);
  protected action = '';
  protected from = '';
  protected to = '';
  protected readonly dateTime = dateTime;

  constructor() {
    void this.load(1);
  }

  protected label(action: string): string {
    return ACTIONS[action] ?? action;
  }

  /** Old → new per field (new_values may carry extras, e.g. a reason). */
  protected changes(log: Log): { key: string; old?: string; new: string }[] {
    const keys = new Set([...Object.keys(log.new_values ?? {}), ...Object.keys(log.old_values ?? {})]);
    const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    return [...keys].map((key) => ({
      key,
      old: log.old_values && key in log.old_values ? show(log.old_values[key]) : undefined,
      new: show(log.new_values?.[key]),
    }));
  }

  protected async load(page: number): Promise<void> {
    try {
      const res = await this.api.get<{ data: Log[]; meta: Page }>('/admin/audit-logs', { action: this.action, from: this.from, to: this.to, page });
      this.rows.set(res.data);
      this.page.set(res.meta);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }
}
