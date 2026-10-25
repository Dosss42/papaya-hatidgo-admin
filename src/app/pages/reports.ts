import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, ApiError } from '../core/api';
import { BarChart } from '../shared/bar-chart';
import { daysBefore, peso, todayPh } from '../shared/format';

interface RideDay { date: string; requested: number; completed: number; cancelled: number; no_driver: number; fares: string }
interface RideReport { from: string; to: string; days: RideDay[]; totals: { requested: number; completed: number; cancelled: number; no_driver: number; fares: string; one_way: number; two_way: number } }
interface RevenueReport { days: { date: string; payments: number; amount: string }[]; by_plan: { plan: string; audience: string; payments: number; amount: string }[]; totals: { payments: number; amount: string } }
interface DriverReport { drivers: { driver_id: number; full_name: string; rides: number; earnings: string; cancelled: number; rating: number | null; ratings: number }[] }

/**
 * Reports (Phase 14 step 14.6) for a date range on the Philippine calendar (≤ 92 days): rides,
 * subscription revenue, top drivers. Each chart has its numbers next to it (a chart never carries
 * information alone).
 */
@Component({
  selector: 'hg-reports',
  imports: [FormsModule, BarChart],
  template: `
    <div class="grid gap-8">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold">Reports</h1>
          <p class="text-ink-soft">Days follow the Philippine calendar.</p>
        </div>
        <form class="flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); load()">
          <label class="field"><span class="field-label">From</span><input class="input" type="date" name="from" [(ngModel)]="from" /></label>
          <label class="field"><span class="field-label">To</span><input class="input" type="date" name="to" [(ngModel)]="to" /></label>
          <button type="submit" class="btn btn-primary" [disabled]="loading()">{{ loading() ? 'Loading…' : 'Show' }}</button>
        </form>
      </header>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }

      @if (rides(); as r) {
        <section class="grid gap-4" aria-labelledby="rides-h">
          <h2 id="rides-h" class="text-xl font-extrabold">Rides</h2>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div class="card"><p class="text-ink-soft">Booked</p><p class="text-3xl font-extrabold">{{ r.totals.requested }}</p></div>
            <div class="card"><p class="text-ink-soft">Completed</p><p class="text-3xl font-extrabold">{{ r.totals.completed }}</p><p class="text-ink-soft">{{ pct(r.totals.completed, r.totals.requested) }} of booked</p></div>
            <div class="card"><p class="text-ink-soft">Cancelled</p><p class="text-3xl font-extrabold">{{ r.totals.cancelled }}</p></div>
            <div class="card"><p class="text-ink-soft">No driver found</p><p class="text-3xl font-extrabold">{{ r.totals.no_driver }}</p></div>
            <div class="card"><p class="text-ink-soft">Fares (cash)</p><p class="text-3xl font-extrabold">{{ peso(r.totals.fares) }}</p><p class="text-ink-soft">{{ r.totals.one_way }} one-way · {{ r.totals.two_way }} Balikan</p></div>
          </div>
          <div class="card"><hg-bar-chart caption="Completed rides per day" [points]="completedPoints()" /></div>
          <details class="card">
            <summary class="cursor-pointer font-bold">Day by day</summary>
            <div class="mt-3 overflow-x-auto">
              <table class="table">
                <thead><tr><th scope="col">Day</th><th scope="col">Booked</th><th scope="col">Completed</th><th scope="col">Cancelled</th><th scope="col">No driver</th><th scope="col">Fares</th></tr></thead>
                <tbody>
                  @for (d of r.days; track d.date) {
                    <tr><td>{{ d.date }}</td><td>{{ d.requested }}</td><td>{{ d.completed }}</td><td>{{ d.cancelled }}</td><td>{{ d.no_driver }}</td><td>{{ peso(d.fares) }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        </section>
      }

      @if (revenue(); as v) {
        <section class="grid gap-4" aria-labelledby="rev-h">
          <h2 id="rev-h" class="text-xl font-extrabold">Subscription revenue</h2>
          <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <div class="card"><hg-bar-chart caption="Money received per day" [points]="revenuePoints()" [format]="pesoFn" /></div>
            <div class="card grid content-start gap-2">
              <p class="text-ink-soft">Total</p>
              <p class="text-3xl font-extrabold">{{ peso(v.totals.amount) }}</p>
              <p class="text-ink-soft">{{ v.totals.payments }} payments</p>
              <ul class="mt-2 grid gap-1">
                @for (p of v.by_plan; track p.plan) {
                  <li class="flex justify-between gap-2"><span>{{ p.plan }} <span class="text-ink-soft">×{{ p.payments }}</span></span><strong>{{ peso(p.amount) }}</strong></li>
                } @empty {
                  <li class="text-ink-soft">No payments in this range.</li>
                }
              </ul>
            </div>
          </div>
        </section>
      }

      @if (drivers(); as dr) {
        <section class="grid gap-3" aria-labelledby="drv-h">
          <h2 id="drv-h" class="text-xl font-extrabold">Top drivers</h2>
          <div class="overflow-x-auto rounded-hg ring-2 ring-line">
            <table class="table">
              <thead><tr><th scope="col">Driver</th><th scope="col">Rides</th><th scope="col">Cash collected</th><th scope="col">Cancelled by them</th><th scope="col">Rating</th></tr></thead>
              <tbody>
                @for (d of dr.drivers; track d.driver_id) {
                  <tr><td class="font-bold">{{ d.full_name }}</td><td>{{ d.rides }}</td><td>{{ peso(d.earnings) }}</td><td>{{ d.cancelled }}</td><td>{{ d.rating !== null ? '★ ' + d.rating + ' (' + d.ratings + ')' : '—' }}</td></tr>
                } @empty {
                  <tr><td colspan="5" class="text-ink-soft">No completed rides in this range.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
})
export class ReportsPage {
  private readonly api = inject(Api);
  protected to = todayPh();
  protected from = daysBefore(this.to, 29);
  protected readonly rides = signal<RideReport | null>(null);
  protected readonly revenue = signal<RevenueReport | null>(null);
  protected readonly drivers = signal<DriverReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly peso = peso;
  protected readonly pesoFn = (n: number) => peso(n);

  protected readonly completedPoints = computed(() => (this.rides()?.days ?? []).map((d) => ({ label: d.date, value: d.completed })));
  protected readonly revenuePoints = computed(() => (this.revenue()?.days ?? []).map((d) => ({ label: d.date, value: +d.amount })));

  constructor() {
    void this.load();
  }

  protected pct(part: number, whole: number): string {
    return whole ? `${Math.round((part / whole) * 100)}%` : '—';
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    const range = { from: this.from, to: this.to };
    try {
      const [rides, revenue, drivers] = await Promise.all([
        this.api.get<{ data: RideReport }>('/admin/reports/rides', range),
        this.api.get<{ data: RevenueReport }>('/admin/reports/revenue', range),
        this.api.get<{ data: DriverReport }>('/admin/reports/drivers', range),
      ]);
      this.rides.set(rides.data);
      this.revenue.set(revenue.data);
      this.drivers.set(drivers.data);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as ApiError).message);
    } finally {
      this.loading.set(false);
    }
  }
}
