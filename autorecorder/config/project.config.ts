/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ADAPT THIS FILE — 1 of 3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Who this project is: which CopilotKit integration it tests, where its docs
 * live, and how its two services are reached and started.
 *
 * Everything else derives from this. Doc and demo URLs are built from
 * `docBaseUrl` and `frontendUrl`, so a page never repeats them and no page can
 * point at a different framework's docs by accident.
 *
 * `npm run doctor` rejects any field still set to REPLACE_ME, so a half-done
 * adaptation cannot pass as finished.
 */

/** Sentinel for values an adaptation must supply. Doctor fails while any remain. */
export const REPLACE_ME = 'REPLACE_ME' as const;

export interface ProjectConfig {
  /**
   * Doc slug, exactly as it appears in the URL:
   * `https://docs.copilotkit.ai/<framework>/...`
   * e.g. 'ag2', 'ms-agent-dotnet', 'agno', 'langgraph'.
   */
  framework: string;

  /** Human name for logs and the README, e.g. 'AG2 (Python)'. */
  frameworkLabel: string;

  /**
   * Filename prefix for exported videos. Files are named
   * `<videoPrefix>-<NN>-<videoName>.webm`, the index coming from page order.
   *
   * **Name it for BOTH sides of the integration — `<AGENT>-<frontend>`:**
   * 'AG2-angular', 'AG2-react', 'MSNET-react'. These files end up in one
   * folder together, so a prefix carrying only the agent leaves an Angular clip
   * indistinguishable from the React one. Change this in the same commit as
   * `framework`, and delete clips left over under the old prefix — nothing
   * renames them, so they linger and read as current.
   */
  videoPrefix: string;

  /** Doc root this repo tracks. Every page's docPath is appended to it. */
  docBaseUrl: string;

  /** Where the app runs. Every page's route is appended to it. */
  frontendUrl: string;

  /** Where the agent runs. Used only for the pre-flight health check. */
  backendUrl: string;

  /** Health path on the backend. The check falls back to `/docs` then `/`. */
  backendHealthPath: string;

  /** Printed verbatim when the pre-flight check fails, so the fix is copy-pasteable. */
  frontendStartCmd: string;
  backendStartCmd: string;

  /**
   * Appended to each page's route to reach the chrome-free demo.
   * Set to '' if this project's demos live directly on the route.
   */
  demoSuffix: string;

  /**
   * Project-wide overrides of the recorder's fixed waits. Optional; the
   * defaults in `core/timeouts.ts` suit a warm dev server. Raise `demoNavMs`
   * for a stack whose first request compiles the route.
   */
  timeouts?: Partial<import('../core/types').RecorderTimeouts>;

  /**
   * Frontend path the browser calls to reach the agent, relative to
   * `frontendUrl` — e.g. '/api/copilotkit'.
   *
   * Hit once before the first prompt of every recording. A dev server compiles
   * API routes lazily and only on first request, so without this the *page* is
   * ready while the endpoint behind it is not: the first POST then spends its
   * time compiling instead of answering, and the recorder reports that the agent
   * never replied. Measured here at 59s of compile inside a 74s request.
   *
   * The request is expected to fail (a GET against a POST-only route answers
   * 405); compiling it is the whole point. Set to '' to skip.
   */
  runtimeWarmPath: string;
}

export const PROJECT: ProjectConfig = {
  // The doc tree is nested one level deeper than the React variants:
  // https://docs.copilotkit.ai/angular/ag2/... . The slug stays
  // 'ag2' -- it is what identifies the integration -- and the
  // Angular prefix lives in docBaseUrl, which is what doc URLs are built from.
  // This matches DOCS_ROOT in frontend/src/app/lib/nav-config.ts, the app's own
  // source of truth for which doc page each route tests.
  framework: 'ag2',
  frameworkLabel: 'AG2 (Python) + Angular',
  videoPrefix: 'AG2-angular',

  docBaseUrl: 'https://docs.copilotkit.ai/angular/ag2',

  // `ng serve`, not Next. All three are env-overridable, which is how a run
  // moves off a port another project is already holding:
  //   PORT=8300 uv run main.py                                      (backend)
  //   AG2_AGENT_URL=http://localhost:8300/agent/ npm run dev
  //   BACKEND_URL=http://localhost:8300 npm run record              (here)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4204',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:8400',
  // FastAPI + Uvicorn, with the AG-UI stream mounted at `POST /agent/` by
  // AGUIStream(agent).build_asgi() -- POST-only, so it is no use as a health
  // route. /openapi.json is always there and always a GET; it is what
  // frontend/src/app/components/backend-health.ts probes too, so both halves
  // of the repo agree on what "backend is up" means.
  backendHealthPath: '/openapi.json',

  // One command starts both frontend processes: `npm run dev` runs the Copilot
  // Runtime (frontend/server.ts, port 8401) and `ng serve` (port 4204) together.
  frontendStartCmd: 'cd frontend && npm run dev',
  backendStartCmd: 'cd backend && uv run main.py',

  // Demo routes are `<route>/demo`, per frontend/src/app/app.routes.ts.
  demoSuffix: '/demo',

  // Angular has no server route to host the runtime, so it runs as its own Node
  // process and the browser posts across origins to it. The AG2
  // backend already owns 8400, so the runtime binds 8401 (see the port note at
  // the top of frontend/server.ts). That makes the warm target an absolute URL
  // rather than a path under frontendUrl -- `new URL(absolute, base)` returns
  // the absolute, so this needs no engine change.
  //
  // There is no lazy route compilation to trigger here (tsx serves an already
  // built listener), but the first request still pays for the runtime's own
  // connection to the AG2 process, and /info is a real GET endpoint
  // that exercises exactly that path.
  runtimeWarmPath:
    process.env.RUNTIME_URL || 'http://localhost:8401/api/copilotkit/info',
};

/** Absolute doc URL for a page's `docPath`. */
export function docUrlFor(docPath: string): string {
  return `${PROJECT.docBaseUrl.replace(/\/$/, '')}/${docPath.replace(/^\//, '')}`;
}

/** Absolute demo URL for a page's `route`. */
export function demoUrlFor(route: string): string {
  return `${PROJECT.frontendUrl.replace(/\/$/, '')}/${route.replace(/^\//, '')}${PROJECT.demoSuffix}`;
}
