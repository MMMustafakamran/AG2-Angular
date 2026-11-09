import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideCopilotKit } from '@copilotkit/angular';

import { routes } from './app.routes';



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
      runtimeUrl: 'http://localhost:8240/api/copilotkit', // HARNESS: doc says :8200, runtime runs on 8240 (workspace port plan)
      // a2ui : recover incomplete streams start
      a2ui: {
        recovery: { showAfterMs: 2_000, showAfterAttempts: 2 },
      },
      // a2ui : recover incomplete streams end
      // HARNESS: the Frontend tools page's Open Generative UI config (openGenerativeUI with
      // setDashboardFilter) is kept verbatim in doc-verbatim/frontend-tools/app.config.ts, not here:
      // registered at the root it gave every page's agent a generateSandboxedUi tool, which on the
      // Native generative UI demo answered with an empty message instead of text.
    }),
    // quickstart : connect to copilot runtime end
  ],
};
