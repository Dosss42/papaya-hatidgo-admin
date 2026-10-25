import { Component, computed, input } from '@angular/core';

export interface BarPoint {
  label: string; // e.g. "2026-10-26"
  value: number;
}

/**
 * A small SVG bar chart (decision #8: no chart library). One series, the bars in Deep Papaya,
 * the highest value labelled, every value readable on hover (title) and in the table the page
 * shows next to it (charts never carry information alone).
 */
@Component({
  selector: 'hg-bar-chart',
  template: `
    <figure class="grid gap-2">
      <figcaption class="font-bold">{{ caption() }}</figcaption>
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" class="h-auto w-full" role="img" [attr.aria-label]="summary()">
        <line [attr.x1]="0" [attr.y1]="height - 20" [attr.x2]="width" [attr.y2]="height - 20" stroke="#d8cfc6" stroke-width="2" />
        @for (bar of bars(); track bar.label) {
          <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h" rx="3" fill="#c2410c">
            <title>{{ bar.label }}: {{ format()(bar.value) }}</title>
          </rect>
        }
        @if (first(); as f) {
          <text [attr.x]="0" [attr.y]="height - 4" font-size="12" fill="#5a4f47">{{ f }}</text>
        }
        @if (last(); as l) {
          <text [attr.x]="width" [attr.y]="height - 4" font-size="12" fill="#5a4f47" text-anchor="end">{{ l }}</text>
        }
        <text x="0" y="12" font-size="12" fill="#5a4f47">max {{ format()(max()) }}</text>
      </svg>
    </figure>
  `,
})
export class BarChart {
  readonly points = input.required<BarPoint[]>();
  readonly caption = input('');
  readonly format = input<(n: number) => string>((n) => String(n));

  protected readonly width = 600;
  protected readonly height = 180;

  protected readonly max = computed(() => Math.max(0, ...this.points().map((p) => p.value)));
  protected readonly bars = computed(() => {
    const points = this.points();
    const max = this.max() || 1;
    const slot = this.width / Math.max(points.length, 1);
    const plot = this.height - 40;
    return points.map((p, i) => {
      const h = Math.round((p.value / max) * plot);
      return { ...p, x: i * slot + slot * 0.15, w: Math.max(slot * 0.7, 1), h, y: this.height - 20 - h };
    });
  });
  protected readonly first = computed(() => this.points()[0]?.label.slice(5) ?? '');
  protected readonly last = computed(() => this.points().at(-1)?.label.slice(5) ?? '');
  protected readonly summary = computed(() => `${this.caption()}: ${this.points().length} days, highest ${this.format()(this.max())}`);
}
