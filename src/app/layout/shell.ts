import { Component, OnDestroy, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { TRICYCLE_SVG } from '../shared/tricycle';

interface NavItem {
  path: string;
  label: string;
  badge?: 'to_review';
}

/**
 * The frame around every admin page (decision #3): a sidebar on desktop, a top menu on narrow
 * screens. The current page is marked by a papaya bar AND bold text (never color alone). The
 * review queue's count shows next to "Verification", refreshed every minute.
 */
@Component({
  selector: 'hg-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 btn btn-primary">Skip to content</a>

      <aside class="border-b-2 border-line bg-surface lg:min-h-dvh lg:border-r-2 lg:border-b-0">
        <div class="flex items-center justify-between gap-3 px-5 py-4">
          <a routerLink="/" class="flex items-center gap-3 no-underline">
            <span class="grid size-11 place-items-center rounded-full bg-papaya-tint text-papaya [&_svg]:size-7" [innerHTML]="logo"></span>
            <span class="leading-tight">
              <span class="block font-extrabold">Papaya HatidGo</span>
              <span class="block text-ink-soft">Admin</span>
            </span>
          </a>
          <button type="button" class="btn btn-outline lg:hidden" [attr.aria-expanded]="menuOpen()" aria-controls="nav" (click)="menuOpen.set(!menuOpen())">Menu</button>
        </div>
        <nav id="nav" class="px-3 pb-4 lg:block" [class.hidden]="!menuOpen()" aria-label="Main">
          <ul class="grid gap-1">
            @for (item of nav; track item.path) {
              <li>
                <a [routerLink]="item.path" routerLinkActive="!bg-ground font-extrabold !text-ink before:!bg-papaya" [routerLinkActiveOptions]="{ exact: item.path === '/' }" ariaCurrentWhenActive="page"
                  class="relative flex min-h-11 items-center justify-between gap-2 rounded-xl px-4 text-ink-soft no-underline before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-transparent hover:bg-ground hover:text-ink"
                  (click)="menuOpen.set(false)">
                  <span>{{ item.label }}</span>
                  @if (item.badge && toReview() > 0) {
                    <span class="rounded-full bg-papaya px-2 text-sm font-extrabold text-white" [attr.aria-label]="toReview() + ' waiting'">{{ toReview() }}</span>
                  }
                </a>
              </li>
            }
          </ul>
        </nav>
      </aside>

      <div class="min-w-0">
        <header class="flex items-center justify-end gap-4 border-b-2 border-line px-6 py-3">
          <span class="text-ink-soft">{{ auth.user()?.full_name }}</span>
          <button type="button" class="btn btn-quiet" (click)="auth.logout()">Log out</button>
        </header>
        <main id="main" class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell implements OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  protected readonly logo = inject(DomSanitizer).bypassSecurityTrustHtml(TRICYCLE_SVG); // our own constant

  protected readonly menuOpen = signal(false);
  protected readonly toReview = signal(0);
  private readonly timer = setInterval(() => void this.loadBadge(), 60_000);

  protected readonly nav: NavItem[] = [
    { path: '/', label: 'Dashboard' },
    { path: '/verification', label: 'Verification', badge: 'to_review' },
    { path: '/rides', label: 'Rides & live map' },
    { path: '/users', label: 'Users' },
    { path: '/fares', label: 'Fares & settings' },
    { path: '/plans', label: 'Plans & payments' },
    { path: '/requirements', label: 'Requirements' },
    { path: '/reports', label: 'Reports' },
    { path: '/audit', label: 'Audit log' },
  ];

  constructor() {
    void this.loadBadge();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async loadBadge(): Promise<void> {
    try {
      const res = await this.api.get<{ data: { to_review: number } }>('/admin/dashboard');
      this.toReview.set(res.data.to_review);
    } catch {
      // keep the last count
    }
  }
}
