import { Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, ApiError } from '../core/api';
import { peso } from '../shared/format';

interface Dashboard {
  to_review: number;
  drivers_online: number;
  rides_active: number;
  rides_today: { requested: number; completed: number; cancelled: number };
  fares_today: string;
  revenue_month: string;
  subscriptions_active: { drivers: number; passengers: number };
  users: { passengers: number; drivers: number; new_this_week: number };
}

/** The admin's first screen: what needs attention, what's happening now, how today is going. */
@Component({
  selector: 'hg-dashboard',
  imports: [RouterLink],
  template: `
    <div class="grid gap-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-3xl font-extrabold">Dashboard</h1>
          <p class="text-ink-soft">Today on the Philippine calendar · refreshes every 30 seconds</p>
        </div>
      </header>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }

      @if (data(); as d) {
        <!-- What needs the admin: first, and the only orange button on the page. -->
        <section class="card flex flex-wrap items-center justify-between gap-4" [class.ring-papaya]="d.to_review > 0" aria-labelledby="review-h">
          <div>
            <h2 id="review-h" class="text-xl font-extrabold">Drivers waiting for review</h2>
            <p class="text-ink-soft">{{ d.to_review === 0 ? 'Nothing waiting. New papers show up here.' : 'Their papers are waiting; they can\\'t drive until approved.' }}</p>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-4xl font-extrabold">{{ d.to_review }}</span>
            <a routerLink="/verification" class="btn" [class.btn-primary]="d.to_review > 0" [class.btn-outline]="d.to_review === 0">Open the queue</a>
          </div>
        </section>

        <section aria-labelledby="now-h" class="grid gap-3">
          <h2 id="now-h" class="text-xl font-extrabold">Right now</h2>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <a routerLink="/rides" class="card no-underline hover:ring-papaya">
              <p class="text-ink-soft">Drivers online</p>
              <p class="text-3xl font-extrabold">{{ d.drivers_online }}</p>
            </a>
            <a routerLink="/rides" class="card no-underline hover:ring-papaya">
              <p class="text-ink-soft">Active rides</p>
              <p class="text-3xl font-extrabold">{{ d.rides_active }}</p>
            </a>
            <div class="card">
              <p class="text-ink-soft">Active subscriptions</p>
              <p class="text-3xl font-extrabold">{{ d.subscriptions_active.drivers + d.subscriptions_active.passengers }}</p>
              <p class="text-ink-soft">{{ d.subscriptions_active.drivers }} drivers · {{ d.subscriptions_active.passengers }} passengers</p>
            </div>
            <a routerLink="/users" class="card no-underline hover:ring-papaya">
              <p class="text-ink-soft">Users</p>
              <p class="text-3xl font-extrabold">{{ d.users.passengers + d.users.drivers }}</p>
              <p class="text-ink-soft">{{ d.users.new_this_week }} new in 7 days</p>
            </a>
          </div>
        </section>

        <section aria-labelledby="today-h" class="grid gap-3">
          <h2 id="today-h" class="text-xl font-extrabold">Today</h2>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="card">
              <p class="text-ink-soft">Rides booked</p>
              <p class="text-3xl font-extrabold">{{ d.rides_today.requested }}</p>
            </div>
            <div class="card">
              <p class="text-ink-soft">Completed</p>
              <p class="text-3xl font-extrabold">{{ d.rides_today.completed }}</p>
              <p class="text-ink-soft">{{ d.rides_today.cancelled }} cancelled</p>
            </div>
            <div class="card">
              <p class="text-ink-soft">Fares collected by drivers</p>
              <p class="text-3xl font-extrabold">{{ peso(d.fares_today) }}</p>
            </div>
            <a routerLink="/plans" class="card no-underline hover:ring-papaya">
              <p class="text-ink-soft">Subscriptions this month</p>
              <p class="text-3xl font-extrabold">{{ peso(d.revenue_month) }}</p>
            </a>
          </div>
        </section>
      } @else if (!error()) {
        <p class="text-ink-soft" role="status">Loading…</p>
      }
    </div>
  `,
})
export class DashboardPage implements OnDestroy {
  private readonly api = inject(Api);
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly peso = peso;
  private readonly timer = setInterval(() => void this.load(), 30_000);

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async load(): Promise<void> {
    try {
      this.data.set((await this.api.get<{ data: Dashboard }>('/admin/dashboard')).data);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }
}
