import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NAV } from '../lib/nav-config';
import { StatusBadge } from './ui';

@Component({
  selector: 'app-nav-sidebar',
  imports: [RouterLink, RouterLinkActive, StatusBadge],
  template: `
    <nav class="flex h-full flex-col gap-6 overflow-y-auto p-5" aria-label="Doc sections">
      <div>
        <a routerLink="/" class="block text-sm font-bold text-[var(--ink)]">
          <span
            class="mb-1 block h-1 w-8 rounded-full bg-[var(--accent)]"
            aria-hidden="true"
          ></span>
          CopilotKit + AG2
          <span class="block text-xs font-medium text-[var(--muted)]">
            Angular test harness
          </span>
        </a>
      </div>

      @for (group of nav; track group.title) {
        <div>
          <h2
            class="mb-2 text-[11px] font-bold tracking-wide text-[var(--muted)] uppercase"
          >
            {{ group.title }}
          </h2>
          <ul class="space-y-0.5">
            @for (route of group.routes; track route.path) {
              <li>
                <a
                  [routerLink]="route.path"
                  routerLinkActive="bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)] shadow-[inset_2px_0_0_var(--accent)]"
                  [routerLinkActiveOptions]="{ exact: route.path === '/' }"
                  class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span>{{ route.title }}</span>
                  <ui-status-badge [status]="route.status" />
                </a>
              </li>
            }
          </ul>
        </div>
      }

      <div class="mt-auto pt-4">
        <a
          routerLink="/status"
          routerLinkActive="bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]"
          class="block rounded-md px-2 py-1.5 text-sm text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-sunken)]"
          >Status overview</a
        >
      </div>
    </nav>
  `,
})
export class NavSidebar {
  protected readonly nav = NAV;
}
