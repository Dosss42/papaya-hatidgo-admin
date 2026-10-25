import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, ApiError, Page } from '../core/api';
import { Chip } from '../shared/chip';
import { ago, dateTime } from '../shared/format';
import { Pager } from '../shared/pager';

interface QueueRow {
  driver_id: number;
  full_name: string;
  phone: string;
  account_status: string;
  compliance_status: string;
  plate_number: string | null;
  documents_to_review: { id: number; requirement: string; is_renewal: boolean; submitted_at: string | null }[];
}

type Tab = 'to_review' | 'pending_verification' | 'under_review' | 'verified' | 'rejected' | 'expired';

/**
 * The review queue (phase-0 § D.4): drivers with papers waiting, longest-waiting first (fair),
 * renewals included. Other tabs list drivers by compliance status.
 */
@Component({
  selector: 'hg-verification',
  imports: [RouterLink, Chip, Pager],
  template: `
    <div class="grid gap-5">
      <header>
        <h1 class="text-3xl font-extrabold">Verification</h1>
        <p class="text-ink-soft">Open a paper to check it against the photo and approve, reject, or ask for a new one.</p>
      </header>

      <div class="flex flex-wrap gap-2" role="group" aria-label="Which drivers">
        @for (t of tabs; track t.value) {
          <button type="button" class="btn" [class.btn-outline]="tab() !== t.value" [class.bg-papaya-tint]="tab() === t.value" [class.ring-2]="tab() === t.value" [class.ring-papaya]="tab() === t.value" [class.font-extrabold]="tab() === t.value"
            [attr.aria-pressed]="tab() === t.value" (click)="select(t.value)">{{ t.label }}</button>
        }
      </div>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }

      @if (rows(); as list) {
        @if (list.length === 0) {
          <div class="card text-center">
            <p class="text-xl font-bold">{{ tab() === 'to_review' ? 'Nothing waiting for review.' : 'No drivers here.' }}</p>
            <p class="text-ink-soft">New uploads appear in "To review", longest-waiting first.</p>
          </div>
        } @else {
          <div class="overflow-x-auto rounded-hg ring-2 ring-line">
            <table class="table">
              <thead>
                <tr><th scope="col">Driver</th><th scope="col">Status</th><th scope="col">Tricycle</th><th scope="col">Papers to review</th></tr>
              </thead>
              <tbody>
                @for (row of list; track row.driver_id) {
                  <tr>
                    <td>
                      <p class="font-bold">{{ row.full_name }}</p>
                      <p class="text-ink-soft">{{ row.phone }}</p>
                      @if (row.account_status === 'suspended') {
                        <hg-chip status="suspended" />
                      }
                    </td>
                    <td><hg-chip [status]="row.compliance_status" /></td>
                    <td>{{ row.plate_number ?? '—' }}</td>
                    <td>
                      @if (row.documents_to_review.length === 0) {
                        <span class="text-ink-soft">None</span>
                      }
                      <ul class="grid gap-1">
                        @for (doc of row.documents_to_review; track doc.id) {
                          <li>
                            <a [routerLink]="['/verification', doc.id]" class="font-bold text-papaya underline underline-offset-4">{{ doc.requirement }}</a>
                            @if (doc.is_renewal) {
                              <span class="chip chip-neutral ml-1">Renewal</span>
                            }
                            <span class="text-ink-soft" [title]="dateTime(doc.submitted_at)"> · sent {{ ago(doc.submitted_at) }}</span>
                          </li>
                        }
                      </ul>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <hg-pager [page]="page()" (go)="load($event)" />
        }
      } @else if (!error()) {
        <p class="text-ink-soft" role="status">Loading…</p>
      }
    </div>
  `,
})
export class VerificationPage {
  private readonly api = inject(Api);
  protected readonly tabs: { value: Tab; label: string }[] = [
    { value: 'to_review', label: 'To review' },
    { value: 'pending_verification', label: 'Not complete' },
    { value: 'under_review', label: 'Under review' },
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'expired', label: 'Expired' },
  ];
  protected readonly tab = signal<Tab>('to_review');
  protected readonly rows = signal<QueueRow[] | null>(null);
  protected readonly page = signal<Page | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly ago = ago;
  protected readonly dateTime = dateTime;

  constructor() {
    void this.load(1);
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    this.rows.set(null);
    void this.load(1);
  }

  protected async load(page: number): Promise<void> {
    try {
      const res = await this.api.get<{ data: QueueRow[]; meta: Page }>('/admin/driver-verifications', { status: this.tab(), page });
      this.rows.set(res.data);
      this.page.set(res.meta);
      this.error.set(null);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }
}
