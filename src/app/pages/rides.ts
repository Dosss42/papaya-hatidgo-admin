import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { environment } from '../../environments/environment';
import { Api, ApiError } from '../core/api';
import { Chip } from '../shared/chip';
import { DomSanitizer } from '@angular/platform-browser';
import { ago, dateTime, peso, reasonLabel, rideType, timeOnly } from '../shared/format';
import { ReasonDialog } from '../shared/reason-dialog';
import { TRICYCLE_SVG } from '../shared/tricycle';

interface LiveDriver {
  driver_id: number;
  full_name: string;
  plate_number: string | null;
  lat: number;
  lng: number;
  location_updated_at: string | null;
  matchable: boolean;
  on_ride: boolean;
}

interface LiveRide {
  id: number;
  reference_no: string;
  status: string;
  ride_type: string;
  current_leg: string | null;
  passenger: string;
  driver: string | null;
  plate_number: string | null;
  pickup: { lat: number; lng: number; landmark: string | null };
  destination: { lat: number; lng: number; landmark: string | null };
  /** The road the fare was measured on, [[lat, lng], …]; null on rides booked before roads. */
  route?: [number, number][] | null;
  estimated_total: string;
  requested_at: string | null;
}

interface Live {
  service_area: { center_lat: number; center_lng: number; radius_km: number };
  drivers: LiveDriver[];
  rides: LiveRide[];
}

interface RideRow {
  id: number;
  reference_no: string;
  ride_type: string;
  status: string;
  pickup: { landmark: string | null };
  destination: { landmark: string | null };
  fare: { total: string; is_final: boolean };
  times: { requested_at: string | null };
  cancelled_by: string | null;
  cancel_reason: string | null;
  driver: { first_name: string; last_name: string } | null;
}

const ACTIVE = ['requested', 'accepted', 'driver_arriving', 'arrived', 'in_progress'];

/**
 * Monitoring (Phase 14 step 14.4): the live map (online drivers + active rides, every 10 s,
 * decision #7) and the ride list with filters. An admin may cancel any active ride, with a
 * reason both people will see; it's audited.
 */
@Component({
  selector: 'hg-rides',
  imports: [FormsModule, Chip, ReasonDialog],
  template: `
    <div class="grid gap-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-3xl font-extrabold">Rides & live map</h1>
          <p class="text-ink-soft" aria-live="polite">The map refreshes every 10 seconds{{ updatedAt() ? ' · last updated ' + timeOnly(updatedAt()) : '' }}{{ pollFailed() ? ' · the last refresh failed, showing older data' : '' }}.</p>
        </div>
      </header>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }

      <section class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]" aria-label="Live map of online drivers and active rides">
        <div class="card overflow-hidden p-0">
          <div #map class="h-[28rem] w-full bg-surface"></div>
          <ul class="flex flex-wrap gap-x-5 gap-y-1 border-t-2 border-line px-4 py-2 text-ink-soft" aria-label="Map key">
            <li class="flex items-center gap-2"><span class="hg-marker scale-75" aria-hidden="true"><span class="hg-marker__driver" [innerHTML]="tricycle"></span></span> Online driver</li>
            <li class="flex items-center gap-2"><span class="hg-marker hg-marker--busy scale-75" aria-hidden="true"><span class="hg-marker__driver" [innerHTML]="tricycle"></span></span> On a ride</li>
            <li class="flex items-center gap-2"><span class="hg-marker hg-marker--stale scale-75" aria-hidden="true"><span class="hg-marker__driver" [innerHTML]="tricycle"></span></span> Online, not located lately (not matched)</li>
            <li class="flex items-center gap-2"><span class="hg-marker" aria-hidden="true"><span class="hg-marker__dot"></span></span> Pickup</li>
            <li class="flex items-center gap-2"><span class="hg-marker mt-1 ml-1" aria-hidden="true"><span class="hg-marker__pin"></span></span> Destination</li>
          </ul>
        </div>

        <div class="grid content-start gap-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="card p-4"><p class="text-ink-soft">Drivers online</p><p class="text-3xl font-extrabold">{{ live()?.drivers?.length ?? '—' }}</p></div>
            <div class="card p-4"><p class="text-ink-soft">Active rides</p><p class="text-3xl font-extrabold">{{ live()?.rides?.length ?? '—' }}</p></div>
          </div>
          <h2 class="text-xl font-extrabold">Active rides</h2>
          @if (live(); as l) {
            @if (l.rides.length === 0) {
              <p class="text-ink-soft">No rides right now.</p>
            }
            <ul class="grid gap-2">
              @for (r of l.rides; track r.id) {
                <li class="card grid gap-1 p-4">
                  <div class="flex items-center justify-between gap-2">
                    <button type="button" class="font-extrabold text-papaya underline underline-offset-4" (click)="focus(r)">{{ r.reference_no }}</button>
                    <hg-chip [status]="r.status" />
                  </div>
                  <p>{{ r.passenger }} → {{ r.driver ?? 'no driver yet' }} {{ r.plate_number ? '(' + r.plate_number + ')' : '' }}</p>
                  <p class="text-ink-soft">{{ rideType(r.ride_type) }} · {{ peso(r.estimated_total) }} · booked {{ ago(r.requested_at) }}</p>
                  <button type="button" class="btn btn-quiet w-fit px-0" (click)="cancelling.set(r.id)">Cancel this ride</button>
                </li>
              }
            </ul>
          }
        </div>
      </section>

      <section class="grid gap-3" aria-labelledby="list-h">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h2 id="list-h" class="text-xl font-extrabold">Recent rides</h2>
          <div class="flex flex-wrap gap-3">
            <label class="field">
              <span class="field-label">Status</span>
              <select class="input" [(ngModel)]="status" (ngModelChange)="loadList()" name="status">
                <option value="">All</option>
                <option value="requested">Looking for a driver</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">On the trip</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Type</span>
              <select class="input" [(ngModel)]="type" (ngModelChange)="loadList()" name="type">
                <option value="">All</option>
                <option value="one_way">One-way</option>
                <option value="two_way">Balikan</option>
              </select>
            </label>
          </div>
        </div>
        <div class="overflow-x-auto rounded-hg ring-2 ring-line">
          <table class="table">
            <thead><tr><th scope="col">Ride</th><th scope="col">Booked</th><th scope="col">Route</th><th scope="col">Driver</th><th scope="col">Fare</th><th scope="col">Status</th></tr></thead>
            <tbody>
              @for (r of list(); track r.id) {
                <tr>
                  <td class="font-bold whitespace-nowrap">{{ r.reference_no }}<br /><span class="font-normal text-ink-soft">{{ rideType(r.ride_type) }}</span></td>
                  <td>{{ dateTime(r.times.requested_at) }}</td>
                  <td>{{ r.pickup.landmark || 'Pinned' }} → {{ r.destination.landmark || 'Pinned' }}</td>
                  <td>{{ r.driver ? r.driver.first_name + ' ' + r.driver.last_name : '—' }}</td>
                  <td>{{ peso(r.fare.total) }}{{ r.fare.is_final ? '' : ' (est.)' }}</td>
                  <td>
                    <hg-chip [status]="r.status" />
                    @if (r.status === 'cancelled' && r.cancelled_by) {
                      <p class="text-ink-soft">by {{ r.cancelled_by === 'system' ? 'system (no driver)' : r.cancelled_by }}{{ r.cancel_reason ? ': ' + reasonLabel(r.cancel_reason) : '' }}</p>
                    }
                    @if (isActive(r.status)) {
                      <button type="button" class="btn btn-quiet px-0" (click)="cancelling.set(r.id)">Cancel</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="text-ink-soft">No rides match.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="text-ink-soft">The newest 50 rides that match.</p>
      </section>
    </div>

    <hg-reason-dialog [open]="cancelling() !== null" heading="Cancel this ride?" message="Both the passenger and the driver are told. This can't be undone." confirmLabel="Cancel the ride" [danger]="true"
      reasonLabel="Reason (both people will read it)" [busy]="busy()" [error]="dialogError()" (confirmed)="cancel($event)" (closed)="cancelling.set(null); dialogError.set(null)" />
  `,
})
export class RidesPage implements AfterViewInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('map');
  private map: L.Map | null = null;
  private layer: L.LayerGroup | null = null;
  private area: L.Circle | null = null;
  private framed = false;
  private readonly timer = setInterval(() => void this.loadLive(), 10_000);

  protected readonly live = signal<Live | null>(null);
  protected readonly list = signal<RideRow[]>([]);
  protected readonly updatedAt = signal<string | null>(null);
  protected readonly pollFailed = signal(false);
  protected readonly tricycle = inject(DomSanitizer).bypassSecurityTrustHtml(TRICYCLE_SVG); // our own constant
  protected readonly error = signal<string | null>(null);
  protected readonly cancelling = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal<string | null>(null);
  protected status = '';
  protected type = '';

  protected readonly peso = peso;
  protected readonly ago = ago;
  protected readonly dateTime = dateTime;
  protected readonly rideType = rideType;
  protected readonly reasonLabel = reasonLabel;
  protected readonly timeOnly = timeOnly;

  ngAfterViewInit(): void {
    const tiles = environment.mapTiles;
    this.map = L.map(this.mapEl().nativeElement, { center: [15.35, 121.05], zoom: 14, zoomControl: true });
    L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom, tileSize: tiles.tileSize, zoomOffset: tiles.zoomOffset }).addTo(this.map);
    this.map.attributionControl.setPrefix(false);
    this.layer = L.layerGroup().addTo(this.map);
    void this.loadLive();
    void this.loadList();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.map?.remove();
  }

  protected isActive(status: string): boolean {
    return ACTIVE.includes(status);
  }

  private async loadLive(): Promise<void> {
    try {
      const live = (await this.api.get<{ data: Live }>('/admin/live')).data;
      this.live.set(live);
      this.updatedAt.set(new Date().toISOString());
      this.pollFailed.set(false);
      this.error.set(null);
      this.draw(live);
    } catch (e) {
      this.pollFailed.set(true);
      this.error.set((e as ApiError).message);
    }
  }

  protected async loadList(): Promise<void> {
    try {
      this.list.set((await this.api.get<{ data: RideRow[] }>('/admin/rides', { status: this.status, type: this.type })).data);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }

  private draw(live: Live): void {
    if (!this.map || !this.layer) return;
    const center: L.LatLngTuple = [live.service_area.center_lat, live.service_area.center_lng];
    if (!this.area) {
      this.area = L.circle(center, { radius: live.service_area.radius_km * 1000, className: 'hg-area', interactive: false }).addTo(this.map);
    } else {
      this.area.setLatLng(center).setRadius(live.service_area.radius_km * 1000);
    }
    if (!this.framed) {
      this.map.fitBounds(this.area.getBounds(), { padding: [12, 12] });
      this.framed = true;
    }

    this.layer.clearLayers();
    for (const r of live.rides) {
      // The road the fare was measured on (after Phase 13); a straight line for older rides.
      const line: [number, number][] = r.route && r.route.length >= 2 ? r.route : [[r.pickup.lat, r.pickup.lng], [r.destination.lat, r.destination.lng]];
      L.polyline(line, { className: 'hg-line hg-line--route', interactive: false }).addTo(this.layer);
      this.pin([r.pickup.lat, r.pickup.lng], 'pickup', `${r.reference_no} pickup: ${r.pickup.landmark ?? 'pinned'}`);
      this.pin([r.destination.lat, r.destination.lng], 'destination', `${r.reference_no} destination: ${r.destination.landmark ?? 'pinned'}`);
    }
    for (const d of live.drivers) {
      const cls = `hg-marker hg-marker--driver${d.on_ride ? ' hg-marker--busy' : ''}${d.matchable ? '' : ' hg-marker--stale'}`;
      const state = d.on_ride ? 'on a ride' : d.matchable ? 'waiting for passengers' : 'not located lately';
      L.marker([d.lat, d.lng], {
        icon: L.divIcon({ className: cls, html: `<span class="hg-marker__driver">${TRICYCLE_SVG}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: `${d.full_name} (${d.plate_number ?? 'no plate'}) · ${state} · located ${ago(d.location_updated_at)}`,
        keyboard: false,
      }).addTo(this.layer);
    }
  }

  private pin(at: L.LatLngTuple, kind: 'pickup' | 'destination', title: string): void {
    const html = kind === 'pickup' ? '<span class="hg-marker__dot"></span>' : '<span class="hg-marker__pin"></span>';
    L.marker(at, {
      icon: L.divIcon({ className: `hg-marker hg-marker--${kind}`, html, iconSize: [22, 22], iconAnchor: kind === 'destination' ? [11, 22] : [11, 11] }),
      title,
      keyboard: false,
    }).addTo(this.layer!);
  }

  protected focus(r: LiveRide): void {
    this.map?.fitBounds(L.latLngBounds([r.pickup.lat, r.pickup.lng], [r.destination.lat, r.destination.lng]), { padding: [40, 40], maxZoom: 17 });
    this.mapEl().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected async cancel(reason: string): Promise<void> {
    const id = this.cancelling();
    if (!id || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.post(`/admin/rides/${id}/cancel`, { reason });
      this.cancelling.set(null);
      await Promise.all([this.loadLive(), this.loadList()]);
    } catch (e) {
      this.dialogError.set((e as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }
}
