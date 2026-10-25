import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, ApiError, Page } from '../core/api';
import { Chip } from '../shared/chip';
import { dateOnly, dateTime, peso } from '../shared/format';
import { Pager } from '../shared/pager';
import { ReasonDialog } from '../shared/reason-dialog';

interface Plan {
  id: number;
  code: string;
  name: string;
  user_type: 'passenger' | 'driver';
  duration_months: number;
  price: string;
  benefits: string | null;
  is_active: boolean;
  sort_order: number;
  active_count: number;
  sold_count: number;
}

interface Transaction {
  id: number;
  user: { full_name: string; email: string; role: string };
  plan: string;
  amount: string;
  status: string;
  provider: string;
  payment_method: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string | null;
}

interface Sub {
  id: number;
  status: string;
  plan: { name: string };
  amount: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  payment: { status: string; method: string | null } | null;
}

interface PlanForm {
  id: number | null;
  code: string;
  name: string;
  user_type: 'passenger' | 'driver';
  duration_months: number;
  price: number;
  benefits: string;
  is_active: boolean;
  sort_order: number;
}

/**
 * Plans & payments (Phase 14 step 14.5): the plans people can buy (a price change applies to new
 * purchases only), every payment attempt, and the audited manual activation for when the payment
 * gateway can't be reached (the demo fallback, phase-0 guarantee #6).
 */
@Component({
  selector: 'hg-plans',
  imports: [FormsModule, Chip, Pager, ReasonDialog],
  template: `
    <div class="grid gap-8">
      <header>
        <h1 class="text-3xl font-extrabold">Plans & payments</h1>
        <p class="text-ink-soft">A new price applies to new purchases; people keep what they paid for.</p>
      </header>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }
      @if (done(); as message) {
        <p class="notice-ok" role="status"><span aria-hidden="true">✓</span> {{ message }}</p>
      }

      <section class="grid gap-3" aria-labelledby="plans-h">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans-h" class="text-xl font-extrabold">Plans</h2>
          <button type="button" class="btn btn-outline" (click)="edit(null)">Add a plan</button>
        </div>
        <div class="overflow-x-auto rounded-hg ring-2 ring-line">
          <table class="table">
            <thead><tr><th scope="col">Plan</th><th scope="col">For</th><th scope="col">Length</th><th scope="col">Price</th><th scope="col">Holding it now</th><th scope="col">On sale</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (p of plans(); track p.id) {
                <tr>
                  <td class="font-bold">{{ p.name }}<br /><span class="font-normal text-ink-soft">{{ p.code }}</span></td>
                  <td>{{ p.user_type === 'driver' ? 'Drivers' : 'Passengers' }}</td>
                  <td>{{ p.duration_months }} {{ p.duration_months === 1 ? 'month' : 'months' }}</td>
                  <td class="font-bold">{{ peso(p.price) }}</td>
                  <td>{{ p.active_count }} <span class="text-ink-soft">({{ p.sold_count }} sold)</span></td>
                  <td>@if (p.is_active) {<span class="chip chip-active">On sale</span>} @else {<span class="chip chip-neutral">Off</span>}</td>
                  <td class="text-right"><button type="button" class="btn btn-quiet" (click)="edit(p)">Edit</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card grid gap-3" aria-labelledby="manual-h">
        <h2 id="manual-h" class="text-xl font-extrabold">Activate a subscription by hand</h2>
        <p class="text-ink-soft">Only when the person paid but the payment gateway couldn't be reached. It's written to the audit log with your reason.</p>
        <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); findSubs()">
          <label class="field min-w-72 flex-1">
            <span class="field-label">Their email</span>
            <input class="input" type="email" name="email" [(ngModel)]="email" placeholder="name@example.com" required />
          </label>
          <button type="submit" class="btn btn-outline" [disabled]="!email">Find</button>
        </form>
        @if (subs(); as list) {
          @if (list.length === 0) {
            <p class="text-ink-soft">No subscriptions for that email.</p>
          }
          <ul class="grid gap-2">
            @for (s of list; track s.id) {
              <li class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-3">
                <span><strong>{{ s.plan.name }}</strong> · {{ peso(s.amount) }} · started {{ dateOnly(s.created_at) }}{{ s.ends_at ? ' · ends ' + dateOnly(s.ends_at) : '' }}</span>
                <span class="flex items-center gap-3">
                  <hg-chip [status]="s.status" [label]="s.status === 'pending' ? 'Waiting for payment' : ''" />
                  @if (s.status === 'pending' || s.status === 'cancelled') {
                    <button type="button" class="btn btn-outline" (click)="activating.set(s)">Activate</button>
                  }
                </span>
              </li>
            }
          </ul>
        }
      </section>

      <section class="grid gap-3" aria-labelledby="tx-h">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h2 id="tx-h" class="text-xl font-extrabold">Payments</h2>
          <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); loadTx(1)">
            <label class="field"><span class="field-label">Status</span>
              <select class="input" name="txs" [(ngModel)]="txStatus" (ngModelChange)="loadTx(1)">
                <option value="">All</option><option value="paid">Paid</option><option value="pending">Waiting</option><option value="failed">Failed</option><option value="expired">Expired</option>
              </select>
            </label>
            <label class="field"><span class="field-label">Person</span><input class="input" name="txq" [(ngModel)]="txQ" placeholder="Name or email" /></label>
            <button type="submit" class="btn btn-outline">Filter</button>
          </form>
        </div>
        <div class="overflow-x-auto rounded-hg ring-2 ring-line">
          <table class="table">
            <thead><tr><th scope="col">When</th><th scope="col">Person</th><th scope="col">Plan</th><th scope="col">Amount</th><th scope="col">Method</th><th scope="col">Status</th></tr></thead>
            <tbody>
              @for (t of txs(); track t.id) {
                <tr>
                  <td>{{ dateTime(t.paid_at ?? t.created_at) }}</td>
                  <td>{{ t.user.full_name }}<br /><span class="text-ink-soft">{{ t.user.email }}</span></td>
                  <td>{{ t.plan }}</td>
                  <td class="font-bold">{{ peso(t.amount) }}</td>
                  <td>{{ t.payment_method ?? '—' }} <span class="text-ink-soft">({{ t.provider }})</span></td>
                  <td><hg-chip [status]="t.status" />@if (t.failure_reason) {<p class="text-ink-soft">{{ t.failure_reason }}</p>}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="text-ink-soft">No payments match.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <hg-pager [page]="txPage()" (go)="loadTx($event)" />
      </section>
    </div>

    <!-- Add / edit a plan -->
    <dialog #planDlg aria-labelledby="plan-dlg-h" class="w-[min(36rem,calc(100vw-2rem))] rounded-hg bg-ground p-0 text-ink shadow-xl backdrop:bg-ink/40" (close)="form.set(null)">
      @if (form(); as f) {
        <form class="grid gap-4 p-6" (submit)="$event.preventDefault(); savePlan()">
          <h2 id="plan-dlg-h" class="text-xl font-extrabold">{{ f.id ? 'Edit ' + f.name : 'Add a plan' }}</h2>
          @if (!f.id) {
            <label class="field"><span class="field-label">Code</span><input class="input" name="code" [(ngModel)]="f.code" required pattern="[a-z][a-z0-9_]*" /><span class="field-hint">{{ planErrors()['code'] || 'Lowercase, e.g. drv_3m. It can\\'t change later.' }}</span></label>
          }
          <label class="field"><span class="field-label">Name</span><input class="input" name="name" [(ngModel)]="f.name" required /></label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="field"><span class="field-label">For</span>
              <select class="input" name="user_type" [(ngModel)]="f.user_type" [disabled]="!!f.id && soldOut(f)"><option value="passenger">Passengers</option><option value="driver">Drivers</option></select>
            </label>
            <label class="field"><span class="field-label">Length (months)</span><input class="input" type="number" name="months" min="1" max="24" [(ngModel)]="f.duration_months" [disabled]="!!f.id && soldOut(f)" /></label>
            <label class="field"><span class="field-label">Price (₱)</span><input class="input" type="number" name="price" min="1" max="100000" step="1" [(ngModel)]="f.price" required /><span class="field-hint">{{ planErrors()['price'] || 'New purchases only' }}</span></label>
            <label class="field"><span class="field-label">Order</span><input class="input" type="number" name="sort" min="0" max="999" [(ngModel)]="f.sort_order" /></label>
          </div>
          @if (f.id && soldOut(f)) {
            <p class="text-ink-soft">People already bought this plan, so who it's for and its length are fixed. Add a new plan for a different length.</p>
          }
          <label class="field"><span class="field-label">Benefits (shown to buyers)</span><textarea class="input min-h-20 py-2" name="benefits" [(ngModel)]="f.benefits" maxlength="1000"></textarea></label>
          <label class="flex items-center gap-3"><input type="checkbox" class="size-5 accent-papaya" name="active" [(ngModel)]="f.is_active" /> <span class="font-bold">On sale</span></label>
          @if (planError(); as message) {
            <p class="notice-error" role="alert">{{ message }}</p>
          }
          <div class="flex justify-end gap-3">
            <button type="button" class="btn btn-quiet" (click)="planDlg.close()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save plan' }}</button>
          </div>
        </form>
      }
    </dialog>

    <hg-reason-dialog [open]="activating() !== null" heading="Activate this subscription by hand?" [message]="'Only if ' + searchedEmail + ' really paid. It starts now and is written to the audit log.'"
      confirmLabel="Activate" reasonLabel="Reason (kept in the audit log)" reasonHint="e.g. Paid by GCash on Oct 26, reference 1234; gateway down."
      [busy]="busy()" [error]="dialogError()" (confirmed)="activate($event)" (closed)="activating.set(null); dialogError.set(null)" />
  `,
})
export class PlansPage {
  private readonly api = inject(Api);
  private readonly planDlg = viewChild.required<ElementRef<HTMLDialogElement>>('planDlg');

  protected readonly plans = signal<Plan[]>([]);
  protected readonly txs = signal<Transaction[]>([]);
  protected readonly txPage = signal<Page | null>(null);
  protected readonly subs = signal<Sub[] | null>(null);
  protected readonly form = signal<PlanForm | null>(null);
  protected readonly activating = signal<Sub | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  protected readonly planError = signal<string | null>(null);
  protected readonly planErrors = signal<Record<string, string>>({});
  protected readonly dialogError = signal<string | null>(null);
  protected email = '';
  /** The email the list was found with (the input may be edited afterwards). */
  protected searchedEmail = '';
  protected txStatus = '';
  protected txQ = '';
  protected readonly peso = peso;
  protected readonly dateTime = dateTime;
  protected readonly dateOnly = dateOnly;

  constructor() {
    void this.loadPlans();
    void this.loadTx(1);
  }

  protected soldOut(f: PlanForm): boolean {
    return (this.plans().find((p) => p.id === f.id)?.sold_count ?? 0) > 0;
  }

  private async loadPlans(): Promise<void> {
    try {
      this.plans.set((await this.api.get<{ data: Plan[] }>('/admin/subscription-plans')).data);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }

  protected async loadTx(page: number): Promise<void> {
    try {
      const res = await this.api.get<{ data: Transaction[]; meta: Page }>('/admin/subscription-transactions', { status: this.txStatus, q: this.txQ.trim(), page });
      this.txs.set(res.data);
      this.txPage.set(res.meta);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }

  protected edit(p: Plan | null): void {
    this.planError.set(null);
    this.planErrors.set({});
    this.form.set(p
      ? { id: p.id, code: p.code, name: p.name, user_type: p.user_type, duration_months: p.duration_months, price: +p.price, benefits: p.benefits ?? '', is_active: p.is_active, sort_order: p.sort_order }
      : { id: null, code: '', name: '', user_type: 'driver', duration_months: 1, price: 99, benefits: '', is_active: true, sort_order: 0 });
    this.planDlg().nativeElement.showModal();
  }

  protected async savePlan(): Promise<void> {
    const f = this.form();
    if (!f || this.busy()) return;
    this.busy.set(true);
    this.planError.set(null);
    try {
      const body: Record<string, unknown> = { name: f.name, price: f.price, benefits: f.benefits || null, is_active: f.is_active, sort_order: f.sort_order };
      if (!f.id || !this.soldOut(f)) Object.assign(body, { user_type: f.user_type, duration_months: f.duration_months });
      if (f.id) await this.api.patch(`/admin/subscription-plans/${f.id}`, body);
      else await this.api.post('/admin/subscription-plans', { ...body, code: f.code });
      this.planDlg().nativeElement.close();
      this.done.set(f.id ? `${f.name} saved.` : `${f.name} added.`);
      await this.loadPlans();
    } catch (e) {
      const err = e as ApiError;
      this.planError.set(err.message);
      this.planErrors.set(err.fieldErrors);
    } finally {
      this.busy.set(false);
    }
  }

  protected async findSubs(): Promise<void> {
    try {
      this.searchedEmail = this.email.trim();
      await this.refreshSubs();
      this.error.set(null);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }

  private async refreshSubs(): Promise<void> {
    this.subs.set((await this.api.get<{ data: Sub[] }>('/admin/subscriptions', { email: this.searchedEmail })).data);
  }

  protected async activate(reason: string): Promise<void> {
    const s = this.activating();
    if (!s || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.post(`/admin/subscriptions/${s.id}/activate`, { reason });
      this.activating.set(null);
      this.done.set('Activated. It is in the audit log.');
      await Promise.all([this.refreshSubs(), this.loadPlans(), this.loadTx(1)]);
    } catch (e) {
      this.dialogError.set((e as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }
}
