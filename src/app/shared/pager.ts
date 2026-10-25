import { Component, input, output } from '@angular/core';
import { Page } from '../core/api';

/** "Page 2 of 5 · 112 results" with Previous / Next. */
@Component({
  selector: 'hg-pager',
  template: `
    @if (page(); as p) {
      <nav class="flex flex-wrap items-center justify-between gap-3 pt-4" aria-label="Pages">
        <p class="text-ink-soft">Page {{ p.current_page }} of {{ p.last_page }} · {{ p.total }} {{ p.total === 1 ? 'result' : 'results' }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn btn-outline" [disabled]="p.current_page <= 1" (click)="go.emit(p.current_page - 1)">Previous</button>
          <button type="button" class="btn btn-outline" [disabled]="p.current_page >= p.last_page" (click)="go.emit(p.current_page + 1)">Next</button>
        </div>
      </nav>
    }
  `,
})
export class Pager {
  readonly page = input<Page | null>(null);
  readonly go = output<number>();
}
