import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { NavSidebar } from './nav-sidebar';

/** Sidebar layout wrapping every doc route. Demo routes render outside it. */
@Component({
  selector: 'app-chrome',
  imports: [RouterOutlet, NavSidebar],
  template: `
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >Skip to main content</a
    >
    <div class="flex h-dvh bg-[var(--bg)]">
      <aside
        class="w-72 shrink-0 border-r border-[var(--line)] bg-[var(--surface)]"
      >
        <app-nav-sidebar />
      </aside>
      <main id="main" class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-4xl px-8 py-10">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class AppChrome {}
