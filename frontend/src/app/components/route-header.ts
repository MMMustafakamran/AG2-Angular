import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { demoPath, docUrl, findRoute } from '../lib/nav-config';
import { StatusBadge } from './ui';

/** Title, status badge, doc link, and demo link for one doc route. */
@Component({
  selector: 'app-route-header',
  imports: [RouterLink, StatusBadge],
  template: `
    @let meta = route();
    @if (meta) {
      <header class="mb-6 border-b border-[var(--line)] pb-5">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight text-[var(--ink)]">{{ meta.title }}</h1>
          <ui-status-badge [status]="meta.status" />
          @if (meta.premium) {
            <span
              class="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800"
              >Premium</span
            >
          }
        </div>

        <p class="mt-2 max-w-3xl text-sm text-[var(--ink-soft)]">{{ meta.summary }}</p>

        @if (meta.statusNote) {
          <p class="mt-2 max-w-3xl rounded-md border-l-2 border-amber-400 bg-amber-50/60 py-1.5 pl-3 text-sm text-amber-900">
            {{ meta.statusNote }}
          </p>
        }

        <div class="mt-4 flex flex-wrap items-center gap-3 text-sm">
          @let demoLink = demo();
          @if (demoLink) {
            <a
              [routerLink]="demoLink"
              class="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-[var(--accent-hover)]"
              >Open demo ↗</a
            >
          }
          <a
            [href]="doc()"
            target="_blank"
            rel="noreferrer"
            class="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
            >Doc page ↗</a
          >
        </div>
      </header>
    }
  `,
})
export class RouteHeader {
  /** App route path, matching a `path` in nav-config. */
  readonly path = input.required<string>();

  protected readonly route = computed(() => findRoute(this.path()));
  protected readonly doc = computed(() => {
    const meta = this.route();
    return meta ? docUrl(meta) : '';
  });
  protected readonly demo = computed(() => {
    const meta = this.route();
    return meta ? demoPath(meta) : undefined;
  });
}
