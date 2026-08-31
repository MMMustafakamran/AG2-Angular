import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { findRoute } from '../lib/nav-config';

/**
 * Thin bar above a chrome-free demo route. Everything below it is the running
 * feature and nothing else, so a demo can be screen-recorded on its own.
 */
@Component({
  selector: 'app-demo-frame',
  imports: [RouterLink],
  template: `
    <div class="flex h-dvh flex-col">
      <div
        class="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm"
      >
        <a
          [routerLink]="backTo()"
          class="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
          >← Notes &amp; source</a
        >
        <span class="font-semibold text-slate-900">{{ title() }}</span>
        <span class="text-slate-500">live demo</span>
      </div>
      <div class="min-h-0 flex-1">
        <ng-content />
      </div>
    </div>
  `,
})
export class DemoFrame {
  /** App route path of the owning doc route, e.g. `/quickstart`. */
  readonly backTo = input.required<string>();

  protected readonly title = computed(
    () => findRoute(this.backTo())?.title ?? 'Demo',
  );
}
