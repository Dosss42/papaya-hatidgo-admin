import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, ApiError } from '../core/api';
import { dateTime, peso } from '../shared/format';

interface Fare {
  id: number;
  base_fare: string;
  rate_per_km: string;
  minimum_fare: string;
  return_rate_multiplier: string;
  waiting_free_minutes: number;
  waiting_fee_per_minute: string;
  service_fee: string;
  effective_from: string;
  created_by: string | null;
  is_current: boolean;
  is_scheduled: boolean;
}

interface Setting {
  key: string;
  value: number | boolean | string;
  type: 'int' | 'decimal' | 'bool' | 'string';
  description: string | null;
  editable: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

type FareForm = Record<'base_fare' | 'rate_per_km' | 'minimum_fare' | 'return_rate_multiplier' | 'waiting_free_minutes' | 'waiting_fee_per_minute' | 'service_fee', number>;

/** How each setting is shown: its group, label, unit, and the API's allowed range (decision #6). */
const SETTING_VIEW: Record<string, { group: string; label: string; unit?: string; min?: number; max?: number; step?: number }> = {
  'ride.one_way_enabled': { group: 'Ride types', label: 'One-way rides' },
  'ride.two_way_enabled': { group: 'Ride types', label: 'Balikan (two-way) rides' },
  'matching.radius_km': { group: 'Matching', label: 'Drivers notified first (push + ring) within', unit: 'km', min: 0.5, max: 20, step: 0.5 },
  'matching.board_radius_km': { group: 'Matching', label: 'Drivers see open requests within (0 = the whole service area)', unit: 'km', min: 0, max: 50, step: 0.5 },
  'matching.max_offers': { group: 'Matching', label: 'Drivers offered each request', min: 1, max: 20, step: 1 },
  'matching.request_timeout_seconds': { group: 'Matching', label: 'Time to find a driver', unit: 'seconds', min: 30, max: 600, step: 10 },
  'matching.stale_online_minutes': { group: 'Matching', label: 'Online only if located within', unit: 'minutes', min: 1, max: 15, step: 1 },
  'ride.min_distance_m': { group: 'Matching', label: 'Shortest allowed trip', unit: 'meters', min: 0, max: 5000, step: 10 },
  'ride.passenger_cancel_after_minutes': { group: 'Matching', label: 'Passenger may cancel a driver on the way only after', unit: 'minutes', min: 1, max: 60, step: 1 },
  'service_area.center_lat': { group: 'Service area', label: 'Center latitude', unit: '°N', min: 4, max: 22, step: 0.0001 },
  'service_area.center_lng': { group: 'Service area', label: 'Center longitude', unit: '°E', min: 116, max: 127, step: 0.0001 },
  'service_area.radius_km': { group: 'Service area', label: 'Radius', unit: 'km', min: 0.5, max: 50, step: 0.5 },
  'subscription.grace_days': { group: 'Subscriptions', label: 'Grace days after a subscription ends', unit: 'days', min: 0, max: 30, step: 1 },
};

/**
 * Fares & settings (Phase 14 step 14.5). A fare is never edited: saving creates a new version
 * effective now or later (decision #5); the history stays. Settings are checked by type and range
 * on the server, all or nothing, and every change is audited (decision #6).
 */
@Component({
  selector: 'hg-fares',
  imports: [FormsModule],
  template: `
    <div class="grid gap-8">
      <header>
        <h1 class="text-3xl font-extrabold">Fares & settings</h1>
        <p class="text-ink-soft">Changes apply to new bookings at once. Rides already booked keep their fare.</p>
      </header>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }

      <!-- Fares -->
      <section class="grid gap-4" aria-labelledby="fare-h">
        <h2 id="fare-h" class="text-xl font-extrabold">Fare</h2>
        @if (current(); as c) {
          <div class="card grid gap-2 sm:grid-cols-4">
            <p><span class="block text-ink-soft">Base fare</span><span class="text-2xl font-extrabold">{{ peso(c.base_fare) }}</span></p>
            <p><span class="block text-ink-soft">Per km</span><span class="text-2xl font-extrabold">{{ peso(c.rate_per_km) }}</span></p>
            <p><span class="block text-ink-soft">Minimum</span><span class="text-2xl font-extrabold">{{ peso(c.minimum_fare) }}</span></p>
            <p><span class="block text-ink-soft">Service fee</span><span class="text-2xl font-extrabold">{{ peso(c.service_fee) }}</span></p>
            <p class="text-ink-soft sm:col-span-4">Balikan way back × {{ c.return_rate_multiplier }} · waiting: first {{ c.waiting_free_minutes }} min free, then {{ peso(c.waiting_fee_per_minute) }}/min · in effect since {{ dateTime(c.effective_from) }}</p>
          </div>
        }

        <form class="card grid gap-4" (submit)="$event.preventDefault(); saveFare()" aria-labelledby="newfare-h">
          <h3 id="newfare-h" class="text-lg font-extrabold">New fare</h3>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            @for (f of fareFields; track f.key) {
              <label class="field">
                <span class="field-label">{{ f.label }}</span>
                <input class="input" type="number" [name]="f.key" [attr.name]="f.key" [(ngModel)]="fare[f.key]" [min]="f.min" [max]="f.max" [step]="f.step" required [class.input-error]="!!fareErrors()[f.key]" />
                <span class="field-hint">{{ fareErrors()[f.key] || f.hint }}</span>
              </label>
            }
          </div>
          <fieldset class="grid gap-2">
            <legend class="field-label">Takes effect</legend>
            <label class="flex items-center gap-2"><input type="radio" name="when" value="now" [(ngModel)]="when" class="size-5 accent-papaya" /> Now</label>
            <label class="flex flex-wrap items-center gap-2"><input type="radio" name="when" value="later" [(ngModel)]="when" class="size-5 accent-papaya" /> Later, on
              <input class="input w-auto" type="datetime-local" name="effective" [(ngModel)]="effectiveFrom" [disabled]="when !== 'later'" aria-label="Date and time it takes effect, Philippine time" /> <span class="text-ink-soft">(Philippine time)</span>
            </label>
          </fieldset>
          @if (fareError(); as message) {
            <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
          }
          @if (fareSaved(); as message) {
            <p class="notice-ok" role="status"><span aria-hidden="true">✓</span> {{ message }}</p>
          }
          <button type="submit" class="btn btn-primary w-fit" [disabled]="savingFare() || (when === 'later' && !effectiveFrom)">{{ savingFare() ? 'Saving…' : 'Save new fare' }}</button>
        </form>

        <details class="card">
          <summary class="cursor-pointer font-bold">Fare history ({{ fares().length }})</summary>
          <div class="mt-3 overflow-x-auto">
            <table class="table">
              <thead><tr><th scope="col">From</th><th scope="col">Base</th><th scope="col">Per km</th><th scope="col">Minimum</th><th scope="col">Way back</th><th scope="col">Waiting</th><th scope="col">Service</th><th scope="col">By</th></tr></thead>
              <tbody>
                @for (f of fares(); track f.id) {
                  <tr>
                    <td>{{ dateTime(f.effective_from) }}
                      @if (f.is_current) {<span class="chip chip-active ml-1">Current</span>}
                      @if (f.is_scheduled) {<span class="chip chip-wait ml-1">Scheduled</span>}
                    </td>
                    <td>{{ peso(f.base_fare) }}</td><td>{{ peso(f.rate_per_km) }}</td><td>{{ peso(f.minimum_fare) }}</td>
                    <td>× {{ f.return_rate_multiplier }}</td><td>{{ f.waiting_free_minutes }} min free, {{ peso(f.waiting_fee_per_minute) }}/min</td>
                    <td>{{ peso(f.service_fee) }}</td><td>{{ f.created_by ?? 'Seed' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <!-- Settings -->
      <form class="grid gap-4" (submit)="$event.preventDefault(); saveSettings()" aria-labelledby="set-h">
        <h2 id="set-h" class="text-xl font-extrabold">Settings</h2>
        @for (group of groups(); track group.name) {
          <fieldset class="card grid gap-4">
            <legend class="px-1 text-lg font-extrabold">{{ group.name }}</legend>
            <div class="grid gap-4 sm:grid-cols-2">
              @for (s of group.settings; track s.key) {
                @if (s.type === 'bool') {
                  <label class="flex min-h-11 items-center gap-3">
                    <input type="checkbox" class="size-5 accent-papaya" [name]="s.key" [attr.name]="s.key" [(ngModel)]="draft[s.key]" (ngModelChange)="touched()" />
                    <span><span class="font-bold">{{ view(s.key).label }}</span> <span class="text-ink-soft">({{ draft[s.key] ? 'on' : 'off' }})</span></span>
                  </label>
                } @else {
                  <label class="field">
                    <span class="field-label">{{ view(s.key).label }}{{ view(s.key).unit ? ' (' + view(s.key).unit + ')' : '' }}</span>
                    <input class="input" type="number" [name]="s.key" [attr.name]="s.key" [(ngModel)]="draft[s.key]" (ngModelChange)="touched()" [min]="view(s.key).min ?? null" [max]="view(s.key).max ?? null" [step]="view(s.key).step ?? null" [class.input-error]="!!settingErrors()['settings.' + s.key]" />
                    <span class="field-hint">{{ settingErrors()['settings.' + s.key] || ('Allowed ' + view(s.key).min + '–' + view(s.key).max) }}{{ s.updated_by ? ' · last changed by ' + s.updated_by : '' }}</span>
                  </label>
                }
              }
            </div>
          </fieldset>
        }
        @if (settingsSaved(); as message) {
          <p class="notice-ok" role="status"><span aria-hidden="true">✓</span> {{ message }}</p>
        }
        @if (settingsError(); as message) {
          <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
        }
        <button type="submit" class="btn btn-outline w-fit" [disabled]="savingSettings() || changedKeys().length === 0">{{ savingSettings() ? 'Saving…' : 'Save settings' + (changedKeys().length ? ' (' + changedKeys().length + ' changed)' : '') }}</button>
      </form>
    </div>
  `,
})
export class FaresPage {
  private readonly api = inject(Api);
  protected readonly fares = signal<Fare[]>([]);
  protected readonly current = computed(() => this.fares().find((f) => f.is_current) ?? null);
  protected readonly settings = signal<Setting[]>([]);
  protected readonly error = signal<string | null>(null);

  protected fare: FareForm = { base_fare: 0, rate_per_km: 0, minimum_fare: 0, return_rate_multiplier: 1, waiting_free_minutes: 0, waiting_fee_per_minute: 0, service_fee: 0 };
  protected when: 'now' | 'later' = 'now';
  protected effectiveFrom = '';
  protected readonly savingFare = signal(false);
  protected readonly fareSaved = signal<string | null>(null);
  protected readonly fareError = signal<string | null>(null);
  protected readonly fareErrors = signal<Record<string, string>>({});

  protected draft: Record<string, number | boolean | string> = {};
  private readonly draftVersion = signal(0);
  protected readonly savingSettings = signal(false);
  protected readonly settingsSaved = signal<string | null>(null);
  protected readonly settingsError = signal<string | null>(null);
  protected readonly settingErrors = signal<Record<string, string>>({});

  protected readonly peso = peso;
  protected readonly dateTime = dateTime;

  protected readonly fareFields: { key: keyof FareForm; label: string; hint: string; min: number; max: number; step: number }[] = [
    { key: 'base_fare', label: 'Base fare (₱)', hint: 'Charged on every trip', min: 0, max: 1000, step: 0.5 },
    { key: 'rate_per_km', label: 'Per km (₱)', hint: 'Times the road distance', min: 0, max: 500, step: 0.5 },
    { key: 'minimum_fare', label: 'Minimum fare (₱)', hint: 'A short trip costs at least this', min: 0, max: 2000, step: 0.5 },
    { key: 'service_fee', label: 'Service fee (₱)', hint: 'Added to each trip', min: 0, max: 500, step: 0.5 },
    { key: 'return_rate_multiplier', label: 'Balikan way back (×)', hint: 'e.g. 0.8 = 80% of the way there', min: 0, max: 3, step: 0.05 },
    { key: 'waiting_free_minutes', label: 'Free waiting (min)', hint: 'Balikan: free before the fee', min: 0, max: 120, step: 1 },
    { key: 'waiting_fee_per_minute', label: 'Waiting fee (₱/min)', hint: 'After the free minutes', min: 0, max: 100, step: 0.5 },
  ];

  protected readonly groups = computed(() => {
    const order = ['Ride types', 'Matching', 'Service area', 'Subscriptions'];
    const editable = this.settings().filter((s) => s.editable && SETTING_VIEW[s.key]);
    return order.map((name) => ({ name, settings: editable.filter((s) => SETTING_VIEW[s.key].group === name) })).filter((g) => g.settings.length);
  });

  protected readonly changedKeys = computed(() => {
    this.draftVersion();
    return this.settings().filter((s) => s.editable && this.draft[s.key] !== undefined && this.draft[s.key] !== s.value).map((s) => s.key);
  });

  constructor() {
    void this.load();
  }

  /** The draft is a plain object (for ngModel): count the changes again after each edit. */
  protected touched(): void {
    this.draftVersion.update((v) => v + 1);
  }

  protected view(key: string) {
    return SETTING_VIEW[key] ?? { group: 'Other', label: key };
  }

  private async load(): Promise<void> {
    try {
      const [fares, settings] = await Promise.all([
        this.api.get<{ data: Fare[] }>('/admin/fare-settings'),
        this.api.get<{ data: Setting[] }>('/admin/system-settings'),
      ]);
      this.fares.set(fares.data);
      const c = fares.data.find((f) => f.is_current);
      if (c) {
        this.fare = {
          base_fare: +c.base_fare, rate_per_km: +c.rate_per_km, minimum_fare: +c.minimum_fare, return_rate_multiplier: +c.return_rate_multiplier,
          waiting_free_minutes: c.waiting_free_minutes, waiting_fee_per_minute: +c.waiting_fee_per_minute, service_fee: +c.service_fee,
        };
      }
      this.applySettings(settings.data);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }

  private applySettings(list: Setting[]): void {
    this.settings.set(list);
    this.draft = Object.fromEntries(list.map((s) => [s.key, s.value]));
    this.draftVersion.update((v) => v + 1);
  }

  protected async saveFare(): Promise<void> {
    if (this.savingFare()) return;
    this.savingFare.set(true);
    this.fareSaved.set(null);
    this.fareError.set(null);
    this.fareErrors.set({});
    try {
      const body = { ...this.fare, effective_from: this.when === 'later' && this.effectiveFrom ? `${this.effectiveFrom}:00+08:00` : null };
      await this.api.post('/admin/fare-settings', body);
      this.fareSaved.set(this.when === 'now' ? 'Saved. New bookings use this fare from now.' : 'Saved. It takes effect at the time you chose.');
      this.fares.set((await this.api.get<{ data: Fare[] }>('/admin/fare-settings')).data);
    } catch (e) {
      const err = e as ApiError;
      this.fareErrors.set(err.fieldErrors);
      this.fareError.set(err.message);
    } finally {
      this.savingFare.set(false);
    }
  }

  protected async saveSettings(): Promise<void> {
    const keys = this.changedKeys();
    if (this.savingSettings() || keys.length === 0) return;
    this.savingSettings.set(true);
    this.settingsSaved.set(null);
    this.settingsError.set(null);
    this.settingErrors.set({});
    try {
      const settings = Object.fromEntries(keys.map((k) => [k, this.draft[k]]));
      const res = await this.api.patch<{ data: Setting[] }>('/admin/system-settings', { settings });
      this.applySettings(res.data);
      this.settingsSaved.set(`Saved ${keys.length} ${keys.length === 1 ? 'setting' : 'settings'}. The app follows at once.`);
    } catch (e) {
      const err = e as ApiError;
      this.settingErrors.set(err.fieldErrors);
      this.settingsError.set(err.message);
    } finally {
      this.savingSettings.set(false);
    }
  }
}
