import { Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, ApiError } from '../core/api';
import { Chip } from '../shared/chip';
import { dateOnly, dateTime, todayPh } from '../shared/format';
import { ReasonDialog } from '../shared/reason-dialog';

interface DocFile {
  id: number;
  side: string | null;
  mime_type: string;
  original_filename: string | null;
  url: string;
}

interface AdminDocument {
  id: number;
  requirement: { name: string; requires_expiry: boolean; applies_to: string; max_files: number };
  driver: { id: number; full_name: string; phone: string; account_status: string; compliance_status: string };
  vehicle: { plate_number: string; body_number: string | null; color: string; status: string } | null;
  status: string;
  is_current: boolean;
  document_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  files: DocFile[];
  reviews: { action: string; reason: string | null; reviewer: string | null; created_at: string | null }[];
}

type Decision = 'reject' | 'request-resubmission';

/**
 * One paper, reviewed against its photo (phase-0 § D.4). Files are fetched with the admin's token
 * and shown from memory (blob URLs): there are no public file links (§ K). Approve needs an expiry
 * date when the requirement has one; reject / resubmission need a reason the driver will read.
 */
@Component({
  selector: 'hg-document-review',
  imports: [FormsModule, RouterLink, Chip, ReasonDialog],
  template: `
    <div class="grid gap-5">
      <a routerLink="/verification" class="btn-quiet btn w-fit px-0">← Back to the queue</a>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }
      @if (done(); as message) {
        <p class="notice-ok" role="status"><span aria-hidden="true">✓</span> {{ message }}</p>
      }

      @if (doc(); as d) {
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-3xl font-extrabold">{{ d.requirement.name }}</h1>
            <p class="text-ink-soft">{{ d.driver.full_name }} · {{ d.driver.phone }} {{ d.is_current ? '' : '· Renewal' }}</p>
          </div>
          <hg-chip [status]="d.status" />
        </header>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
          <!-- The photos, as large as the screen allows. -->
          <section class="grid gap-4" aria-label="The uploaded files">
            @for (f of d.files; track f.id) {
              <figure class="card grid gap-2 p-3">
                <figcaption class="font-bold">{{ f.side ? (f.side === 'front' ? 'Front' : 'Back') : 'Photo' }}</figcaption>
                @if (urls()[f.id]; as src) {
                  @if (f.mime_type.startsWith('image/')) {
                    <a [href]="src" target="_blank" rel="noopener" title="Open full size">
                      <img [src]="src" [alt]="d.requirement.name + ' ' + (f.side ?? '')" class="max-h-[70vh] w-full rounded-xl bg-surface object-contain" />
                    </a>
                  } @else {
                    <a class="btn btn-outline w-fit" [href]="src" target="_blank" rel="noopener">Open the PDF</a>
                  }
                } @else if (failed()[f.id]) {
                  <p class="notice-error" role="alert"><span aria-hidden="true">!</span> This file didn't load. You can't approve until you've seen it.</p>
                  <button type="button" class="btn btn-outline w-fit" (click)="loadFile(f)">Try again</button>
                } @else {
                  <p class="text-ink-soft" role="status">Loading the file…</p>
                }
              </figure>
            }
          </section>

          <aside class="grid content-start gap-4">
            <section class="card grid gap-2">
              <h2 class="text-xl font-extrabold">Details the driver entered</h2>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt class="text-ink-soft">Number</dt><dd class="font-bold">{{ d.document_number || '—' }}</dd>
                <dt class="text-ink-soft">Issued</dt><dd>{{ dateOnly(d.issued_at) }}</dd>
                <dt class="text-ink-soft">Expires</dt><dd>{{ dateOnly(d.expires_at) }}</dd>
                <dt class="text-ink-soft">Sent</dt><dd>{{ dateTime(d.submitted_at) }}</dd>
              </dl>
              @if (d.vehicle; as v) {
                <p class="mt-2 rounded-xl bg-surface p-3">Compare with the registered tricycle: <strong>{{ v.plate_number }}</strong>{{ v.body_number ? ' · body no. ' + v.body_number : '' }} · {{ v.color }}</p>
              }
            </section>

            @if (d.status === 'pending') {
              <section class="card grid gap-3" aria-labelledby="decide-h">
                <h2 id="decide-h" class="text-xl font-extrabold">Your decision</h2>
                @if (d.requirement.requires_expiry) {
                  <label class="field">
                    <span class="field-label">Valid until</span>
                    <input class="input" type="date" name="expires" [(ngModel)]="expiresAt" [min]="tomorrow" />
                    <span class="field-hint">Check it against the paper. The driver is reminded before it ends.</span>
                  </label>
                }
                <button type="button" class="btn btn-primary" (click)="approve()" [disabled]="busy() || !allSeen() || (d.requirement.requires_expiry && !expiresAt)">{{ busy() ? 'Saving…' : 'Approve' }}</button>
                @if (!allSeen()) {
                  <p class="text-ink-soft">Approve unlocks once every photo has loaded: check the paper first.</p>
                }
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-outline flex-1" (click)="decision.set('request-resubmission')" [disabled]="busy()">Ask for a new photo</button>
                  <button type="button" class="btn btn-outline flex-1 !text-alert !ring-alert" (click)="decision.set('reject')" [disabled]="busy()">Reject</button>
                </div>
              </section>
            }

            @if (d.reviews.length) {
              <section class="card grid gap-2">
                <h2 class="text-xl font-extrabold">History</h2>
                <ul class="grid gap-2">
                  @for (r of d.reviews; track $index) {
                    <li class="border-t-2 border-line pt-2 first:border-0 first:pt-0">
                      <p><hg-chip [status]="r.action === 'resubmission_requested' ? 'resubmission_required' : r.action" /> <span class="text-ink-soft">{{ dateTime(r.created_at) }} · {{ r.reviewer ?? 'System' }}</span></p>
                      @if (r.reason) {
                        <p class="mt-1">"{{ r.reason }}"</p>
                      }
                    </li>
                  }
                </ul>
              </section>
            }
          </aside>
        </div>
      } @else if (!error()) {
        <p class="text-ink-soft" role="status">Loading…</p>
      }
    </div>

    <hg-reason-dialog
      [open]="decision() !== null"
      [heading]="decision() === 'reject' ? 'Reject this paper?' : 'Ask for a new photo?'"
      [message]="decision() === 'reject' ? 'The driver must upload it again. Say what is wrong.' : 'Use this when the photo is blurry or cut off. Say what to fix.'"
      [confirmLabel]="decision() === 'reject' ? 'Reject' : 'Ask for a new photo'"
      [danger]="decision() === 'reject'"
      reasonLabel="What the driver should fix"
      [busy]="busy()"
      [error]="dialogError()"
      (confirmed)="decide($event)"
      (closed)="decision.set(null); dialogError.set(null)" />
  `,
})
export class DocumentReviewPage implements OnDestroy {
  /** From the route /verification/:documentId. */
  readonly documentId = input.required<string>();

  private readonly api = inject(Api);

  protected readonly doc = signal<AdminDocument | null>(null);
  protected readonly urls = signal<Record<number, string>>({});
  protected readonly failed = signal<Record<number, boolean>>({});
  /** Approve only after every file is on screen (phase-0 § D.4: reviewed against the photo). */
  protected readonly allSeen = computed(() => {
    const d = this.doc();
    return !!d && d.files.length > 0 && d.files.every((file) => !!this.urls()[file.id]);
  });
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly decision = signal<Decision | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected expiresAt = '';
  protected readonly tomorrow = (() => {
    const d = new Date(todayPh() + 'T12:00:00+08:00');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  protected readonly dateTime = dateTime;
  protected readonly dateOnly = dateOnly;

  constructor() {
    // Only the id is tracked: load() reads the photo signals, and tracking them would reload
    // the document every time a photo arrived (an endless loop, caught in the browser check).
    effect(() => {
      const id = this.documentId();
      untracked(() => void this.load(id));
    });
  }

  ngOnDestroy(): void {
    this.revokeAll();
  }

  private revokeAll(): void {
    Object.values(this.urls()).forEach((u) => URL.revokeObjectURL(u));
    this.urls.set({});
    this.failed.set({});
  }

  /** One file, on its own: a failure doesn't stop the others, and it can be retried. */
  protected async loadFile(file: DocFile): Promise<void> {
    this.failed.update((m) => ({ ...m, [file.id]: false }));
    try {
      const blob = await this.api.blob(file.url);
      this.urls.update((u) => ({ ...u, [file.id]: URL.createObjectURL(blob) }));
    } catch {
      this.failed.update((m) => ({ ...m, [file.id]: true }));
    }
  }

  private async load(id: string): Promise<void> {
    try {
      this.revokeAll(); // another document: drop the previous one's photos
      this.doc.set(null);
      const res = await this.api.get<{ data: AdminDocument }>(`/admin/driver-documents/${id}`);
      this.doc.set(res.data);
      this.expiresAt = res.data.expires_at ?? '';
      this.error.set(null);
      await Promise.all(res.data.files.map((file) => this.loadFile(file)));
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }

  protected async approve(): Promise<void> {
    const d = this.doc();
    if (!d || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.post<{ data: AdminDocument }>(`/admin/driver-documents/${d.id}/approve`, d.requirement.requires_expiry ? { expires_at: this.expiresAt } : {});
      this.doc.set({ ...res.data, files: d.files });
      this.done.set(`Approved. ${d.driver.full_name}'s checklist is updated.`);
    } catch (e) {
      this.error.set((e as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async decide(reason: string): Promise<void> {
    const d = this.doc();
    const kind = this.decision();
    if (!d || !kind || this.busy()) return;
    this.busy.set(true);
    try {
      const res = await this.api.post<{ data: AdminDocument }>(`/admin/driver-documents/${d.id}/${kind}`, { reason });
      this.doc.set({ ...res.data, files: d.files });
      this.decision.set(null);
      this.done.set(kind === 'reject' ? 'Rejected. The driver sees your reason in the app.' : 'Sent back. The driver sees what to fix in the app.');
    } catch (e) {
      this.dialogError.set((e as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }
}
