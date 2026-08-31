import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import {
  provideCopilotKit,
  type SandboxFunction,
} from '@copilotkit/angular';
import { z } from 'zod';

import { routes } from './app.routes';

// frontend tools : open generative ui host function start
const setDashboardFilter: SandboxFunction<{ filter: string }> = {
  name: 'setDashboardFilter',
  description: 'Set the active dashboard filter',
  parameters: z.object({ filter: z.string() }),
  handler: async ({ filter }) => {
    sessionStorage.setItem('dashboard-filter', filter);
    return { applied: filter };
  },
};
// frontend tools : open generative ui host function end


/**
 * One provider at the application root, so a conversation started on any demo
 * route continues on every other route.
 *
 * `runtimeUrl` points at the Copilot Runtime from the quickstart — the
 * supported path, where the browser never talks to the AG2 agent directly.
 * The `HttpAgent` binding that reaches the AG2 AG-UI endpoint lives
 * server-side in frontend/server.ts.
 *
 * `a2ui.recovery` and `openGenerativeUI.sandboxFunctions` are the A2UI and
 * generative-UI guide options. No `a2ui.catalog` is set yet — supplying one is
 * what actually registers the render_a2ui renderer, so A2UI stays inert until
 * a catalog is added. See README known issues.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideClientHydration(),
    // quickstart : connect to copilot runtime start
    provideCopilotKit({
      runtimeUrl: 'http://localhost:8401/api/copilotkit',
      // a2ui : recover incomplete streams start
      a2ui: {
        recovery: { showAfterMs: 2_000, showAfterAttempts: 2 },
      },
      // a2ui : recover incomplete streams end
      // frontend tools : open generative ui start
      openGenerativeUI: {
        // `sandboxFunctions` is typed `SandboxFunction[]`, i.e.
        // `SandboxFunction<Record<string, unknown>>[]`, so the guide's
        // `SandboxFunction<{ filter: string }>` is not assignable to it as
        // written. Cast at the array site, the same idiom the docs use for the
        // equivalent `component` variance problem. See README known issues.
        sandboxFunctions: [setDashboardFilter as unknown as SandboxFunction],
      },
      // frontend tools : open generative ui end
    }),
    // quickstart : connect to copilot runtime end
  ],
};
