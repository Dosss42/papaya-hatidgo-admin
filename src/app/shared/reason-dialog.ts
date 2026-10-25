import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * A confirm dialog that asks for a reason (rejecting a paper, suspending, cancelling a ride).
 * The reason is required where the person affected will read it (min 3 characters, as the API).
 * A native <dialog>: focus is trapped, Esc closes, the page behind is inert.
 */
@Component({
  selector: 'hg-reason-dialog',
  imports: [FormsModule],
  template: `
    <dialog #dlg [attr.aria-labelledby]="headingId" class="w-[min(32rem,calc(100vw-2rem))] rounded-hg bg-ground p-0 text-ink shadow-xl backdrop:bg-ink/40" (close)="onClose()">
      <form method="dialog" class="grid gap-4 p-6" (submit)="$event.preventDefault(); confirm()">
        <h2 [id]="headingId" class="text-xl font-extrabold">{{ heading() }}</h2>
        @if (message()) {
          <p class="text-ink-soft">{{ message() }}</p>
        }
        @if (askReason()) {
          <label class="field">
            <span class="field-label">{{ reasonLabel() }}</span>
            <textarea class="input min-h-24 py-2" [(ngModel)]="reason" name="reason" maxlength="500" required></textarea>
            <span class="field-hint">{{ reasonHint() }}</span>
          </label>
        }
        @if (error()) {
          <p class="notice-error" role="alert">{{ error() }}</p>
        }
        <div class="flex flex-wrap justify-end gap-3">
          <button type="button" class="btn btn-quiet" (click)="close()">Keep as is</button>
          <button type="submit" class="btn" [class.btn-danger]="danger()" [class.btn-primary]="!danger()" [disabled]="busy() || (askReason() && reason.trim().length < 3)">
            {{ busy() ? 'Saving…' : confirmLabel() }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class ReasonDialog {
  readonly open = input(false);
  readonly heading = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly danger = input(false);
  readonly askReason = input(true);
  readonly reasonLabel = input('Reason');
  readonly reasonHint = input('The person affected will read this.');
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<string>();
  readonly closed = output<void>();

  protected reason = '';
  private static count = 0;
  protected readonly headingId = `reason-dlg-${++ReasonDialog.count}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly shown = signal(false);

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.open() && !el.open) {
        this.reason = '';
        el.showModal();
        this.shown.set(true);
      } else if (!this.open() && el.open) {
        el.close();
      }
    });
  }

  protected confirm(): void {
    if (this.askReason() && this.reason.trim().length < 3) return;
    this.confirmed.emit(this.reason.trim());
  }

  protected close(): void {
    this.dlg().nativeElement.close();
  }

  protected onClose(): void {
    if (this.shown()) {
      this.shown.set(false);
      this.closed.emit();
    }
  }
}
