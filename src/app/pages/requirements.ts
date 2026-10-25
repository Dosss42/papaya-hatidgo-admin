import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, ApiError } from '../core/api';

interface Requirement {
  id: number;
  code: string;
  name: string;
  description: string | null;
  applies_to: 'driver' | 'vehicle';
  max_files: number;
  is_required: boolean;
  is_critical: boolean;
  requires_expiry: boolean;
  is_active: boolean;
  sort_order: number;
}

type Form = Omit<Requirement, 'id'> & { id: number | null };

/**
 * Driver requirements (phase-0 § D, admin-configurable): the papers a driver must upload. They're
 * switched off, never deleted (uploaded papers point to them). A change applies to every driver
 * the next time their checklist is read.
 */
@Component({
  selector: 'hg-requirements',
  imports: [FormsModule],
  template: `
    <div class="grid gap-5">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-3xl font-extrabold">Requirements</h1>
          <p class="text-ink-soft">The papers every driver uploads before driving, in the order the app shows them.</p>
        </div>
        <button type="button" class="btn btn-outline" (click)="edit(null)">Add a requirement</button>
      </header>

      @if (error(); as message) {
        <p class="notice-error" role="alert"><span aria-hidden="true">!</span> {{ message }}</p>
      }
      @if (done(); as message) {
        <p class="notice-ok" role="status"><span aria-hidden="true">✓</span> {{ message }}</p>
      }

      <div class="overflow-x-auto rounded-hg ring-2 ring-line">
        <table class="table">
          <thead><tr><th scope="col">#</th><th scope="col">Paper</th><th scope="col">For</th><th scope="col">Photos</th><th scope="col">Rules</th><th scope="col">In use</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td>{{ r.sort_order }}</td>
                <td class="font-bold">{{ r.name }}<br /><span class="font-normal text-ink-soft">{{ r.code }}</span></td>
                <td>{{ r.applies_to === 'vehicle' ? 'Tricycle' : 'Driver' }}</td>
                <td>{{ r.max_files === 2 ? 'Front + back' : r.max_files }}</td>
                <td>
                  <ul class="text-ink-soft">
                    <li>{{ r.is_required ? 'Required' : 'Optional' }}</li>
                    @if (r.is_critical) {<li>Blocks driving if missing or expired</li>}
                    @if (r.requires_expiry) {<li>Has an expiry date</li>}
                  </ul>
                </td>
                <td>@if (r.is_active) {<span class="chip chip-active">On</span>} @else {<span class="chip chip-neutral">Off</span>}</td>
                <td class="text-right"><button type="button" class="btn btn-quiet" (click)="edit(r)">Edit</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <dialog #dlg aria-labelledby="req-dlg-h" class="w-[min(36rem,calc(100vw-2rem))] rounded-hg bg-ground p-0 text-ink shadow-xl backdrop:bg-ink/40" (close)="form.set(null)">
      @if (form(); as f) {
        <form class="grid gap-4 p-6" (submit)="$event.preventDefault(); save()">
          <h2 id="req-dlg-h" class="text-xl font-extrabold">{{ f.id ? 'Edit ' + f.name : 'Add a requirement' }}</h2>
          @if (!f.id) {
            <label class="field"><span class="field-label">Code</span><input class="input" name="code" [(ngModel)]="f.code" required pattern="[a-z][a-z0-9_]*" /><span class="field-hint">{{ formErrors()['code'] || 'Lowercase, e.g. medical_cert. It can\\'t change later.' }}</span></label>
          }
          <label class="field"><span class="field-label">Name (shown to drivers)</span><input class="input" name="name" [(ngModel)]="f.name" required /></label>
          <label class="field"><span class="field-label">Description</span><textarea class="input min-h-20 py-2" name="description" [(ngModel)]="f.description" maxlength="500"></textarea></label>
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="field"><span class="field-label">For</span>
              <select class="input" name="applies_to" [(ngModel)]="f.applies_to"><option value="driver">Driver</option><option value="vehicle">Tricycle</option></select>
            </label>
            <label class="field"><span class="field-label">Photos</span><input class="input" type="number" name="max_files" min="1" max="4" [(ngModel)]="f.max_files" /></label>
            <label class="field"><span class="field-label">Order</span><input class="input" type="number" name="sort" min="0" max="999" [(ngModel)]="f.sort_order" /></label>
          </div>
          <fieldset class="grid gap-2">
            <legend class="field-label">Rules</legend>
            <label class="flex items-center gap-3"><input type="checkbox" class="size-5 accent-papaya" name="req" [(ngModel)]="f.is_required" /> Required</label>
            <label class="flex items-center gap-3"><input type="checkbox" class="size-5 accent-papaya" name="crit" [(ngModel)]="f.is_critical" /> Blocks driving if missing or expired</label>
            <label class="flex items-center gap-3"><input type="checkbox" class="size-5 accent-papaya" name="exp" [(ngModel)]="f.requires_expiry" /> Has an expiry date (you enter it when approving)</label>
            <label class="flex items-center gap-3"><input type="checkbox" class="size-5 accent-papaya" name="active" [(ngModel)]="f.is_active" /> In use</label>
          </fieldset>
          @if (formError(); as message) {
            <p class="notice-error" role="alert">{{ message }}</p>
          }
          <div class="flex justify-end gap-3">
            <button type="button" class="btn btn-quiet" (click)="dlg.close()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
})
export class RequirementsPage {
  private readonly api = inject(Api);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly rows = signal<Requirement[]>([]);
  protected readonly form = signal<Form | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly formErrors = signal<Record<string, string>>({});

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.rows.set((await this.api.get<{ data: Requirement[] }>('/admin/driver-requirements')).data);
    } catch (e) {
      this.error.set((e as ApiError).message);
    }
  }

  protected edit(r: Requirement | null): void {
    this.formError.set(null);
    this.formErrors.set({});
    this.form.set(r ? { ...r, description: r.description ?? '' } : {
      id: null, code: '', name: '', description: '', applies_to: 'driver', max_files: 1, is_required: true, is_critical: true, requires_expiry: true, is_active: true, sort_order: (this.rows().at(-1)?.sort_order ?? 0) + 1,
    });
    this.dlg().nativeElement.showModal();
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f || this.busy()) return;
    this.busy.set(true);
    const { id, code, ...body } = f;
    try {
      if (id) await this.api.patch(`/admin/driver-requirements/${id}`, { ...body, description: body.description || null });
      else await this.api.post('/admin/driver-requirements', { ...body, code, description: body.description || null });
      this.dlg().nativeElement.close();
      this.done.set(`${f.name} saved. Drivers see it the next time they open their checklist.`);
      await this.load();
    } catch (e) {
      const err = e as ApiError;
      this.formError.set(err.message);
      this.formErrors.set(err.fieldErrors);
    } finally {
      this.busy.set(false);
    }
  }
}
