/** Display helpers: money in pesos, times on the Philippine clock (Asia/Manila), status words. */

const TZ = 'Asia/Manila';

export function peso(amount: string | number | null | undefined): string {
  const n = Number(amount ?? 0);
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Oct 26, 2026 · 2:15 PM" (Philippine time, whatever the admin PC's time zone). */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** "2:15:04 PM" on the Philippine clock (the live map's last update). */
export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso.length === 10 ? iso + 'T00:00:00+08:00' : iso).toLocaleDateString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
}

/** "3 min ago" / "2 h ago" for live data. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Today in the Philippines as YYYY-MM-DD (the reports' default "to"). */
export function todayPh(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function daysBefore(ymd: string, days: number): string {
  const d = new Date(ymd + 'T12:00:00+08:00');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

export type ChipKind = 'ok' | 'wait' | 'bad' | 'neutral' | 'active';

/** A status word + its chip (mark + word). Unknown statuses read as-is, neutral. */
export function statusChip(status: string | null | undefined): { kind: ChipKind; label: string } {
  const map: Record<string, { kind: ChipKind; label: string }> = {
    // documents & compliance
    pending: { kind: 'wait', label: 'Waiting for review' },
    approved: { kind: 'ok', label: 'Approved' },
    rejected: { kind: 'bad', label: 'Rejected' },
    resubmission_required: { kind: 'bad', label: 'Resubmission asked' },
    expired: { kind: 'bad', label: 'Expired' },
    pending_verification: { kind: 'neutral', label: 'Not complete' },
    under_review: { kind: 'wait', label: 'Under review' },
    verified: { kind: 'ok', label: 'Verified' },
    // accounts
    active: { kind: 'active', label: 'Active' }, // not a success: papaya, not green (DESIGN.md)
    suspended: { kind: 'bad', label: 'Suspended' },
    // rides
    requested: { kind: 'wait', label: 'Looking for a driver' },
    accepted: { kind: 'active', label: 'Accepted' },
    driver_arriving: { kind: 'active', label: 'Driver coming' },
    arrived: { kind: 'active', label: 'Driver at pickup' },
    in_progress: { kind: 'active', label: 'On the trip' },
    completed: { kind: 'ok', label: 'Completed' },
    cancelled: { kind: 'neutral', label: 'Cancelled' },
    // payments
    paid: { kind: 'ok', label: 'Paid' },
    failed: { kind: 'bad', label: 'Failed' },
    refunded: { kind: 'neutral', label: 'Refunded' },
  };
  return map[status ?? ''] ?? { kind: 'neutral', label: status ?? '—' };
}

export function rideType(type: string): string {
  return type === 'two_way' ? 'Balikan' : 'One-way';
}

/** A cancel reason in words: the apps send stable codes (Phases 10–11); free text shows as written. */
export function reasonLabel(reason: string | null | undefined): string {
  const map: Record<string, string> = {
    no_driver: 'no driver accepted in time',
    driver_late: 'the driver was taking long',
    changed_plans: 'plans changed',
    wrong_pickup: 'wrong pickup',
    vehicle_problem: 'tricycle problem',
    passenger_not_found: "couldn't find the passenger",
    passenger_no_show: "the passenger didn't show up",
    other: 'other reason',
  };
  return reason ? (map[reason] ?? reason) : '';
}
