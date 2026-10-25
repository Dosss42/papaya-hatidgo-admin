import { Component, computed, input } from '@angular/core';
import { statusChip } from './format';

/** A status chip: a dot (the mark) + the word. Never color alone (DESIGN.md). */
@Component({
  selector: 'hg-chip',
  template: `<span [class]="'chip chip-' + view().kind">{{ label() || view().label }}</span>`,
})
export class Chip {
  readonly status = input.required<string | null | undefined>();
  /** Override the word (e.g. "Online"). */
  readonly label = input<string>('');
  protected readonly view = computed(() => statusChip(this.status()));
}
