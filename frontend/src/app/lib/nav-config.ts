/**
 * The nav, every route header, the demo links, and the README status table all
 * read from here, so a doc page and its implementation status are described
 * exactly once.
 *
 * Groups mirror the sidebar at
 * https://docs.copilotkit.ai/angular/ag2 as of DOC_SYNC_DATE. The
 * last doc page covers four topics at once; it is split into four routes here,
 * which all point back at the same `docPath`.
 */

export const DOC_SYNC_DATE = '2026-08-31';
export const DOCS_ROOT = 'https://docs.copilotkit.ai/angular/ag2';

/**
 * working   — implemented and exercisable against the local stack.
 * partial   — implemented, but something outside this repo limits it
 *             (a premium license, a runtime capability this repo does not run).
 * reference — intentionally not a live feature; notes surface only.
 * broken    — implemented but currently failing.
 */
export type RouteStatus =
  | 'working'
  | 'partial'
  | 'reference'
  | 'broken'
  | 'not-started';

export interface RouteMeta {
  /** App route path. */
  path: string;
  /** Nav label. */
  title: string;
  /** Doc page this route tests, relative to docs.copilotkit.ai. */
  docPath: string;
  /** One-line description in our own words. */
  summary: string;
  status: RouteStatus;
  /** Shown in the route header when the status is not plain "working". */
  statusNote?: string;
  /** Feature requires a CopilotKit Enterprise Intelligence license. */
  premium?: boolean;
  /**
   * This route owns a live interactive surface, which lives at `<path>/demo`
   * rather than on the page itself. The doc route keeps the explanation and the
   * source; the demo route is chrome-free so it can be screen-recorded alone.
   */
  hasDemo?: boolean;
}

/** Where a route's interactive demo lives, if it has one. */
export function demoPath(route: RouteMeta): string | undefined {
  if (!route.hasDemo) return undefined;
  return route.path === '/' ? '/demo' : `${route.path}/demo`;
}

export interface NavGroup {
  title: string;
  routes: RouteMeta[];
}

export const NAV: NavGroup[] = [
  {
    title: 'Getting Started',
    routes: [
      {
        path: '/',
        title: 'Introduction',
        docPath: '/angular/ag2',
        summary:
          'What this harness covers and how the three processes fit together.',
        status: 'reference',
        statusNote: 'Landing page — orientation and a live connection check.',
      },
      {
        path: '/quickstart',
        hasDemo: true,
        title: 'Quickstart',
        docPath: '/angular/ag2/quickstart',
        summary:
          'The smallest end-to-end path: an HttpAgent in Copilot Runtime pointed at the AG2 AGUIStream endpoint, provideCopilotKit, and one copilot-chat.',
        status: 'working',
        statusNote:
          'The Angular half of the page is complete. Its backend step is not: the page ships the literal comment "setup skipped: agent-setup is not bundled for ag2" where the AG2 server should be. See Known issues.',
      },
    ],
  },
  {
    title: 'Guides',
    routes: [
      {
        path: '/chat-ui',
        hasDemo: true,
        title: 'Chat UI and customization',
        docPath: '/angular/ag2/guides/chat-ui',
        summary:
          'The four chat surfaces, a replaced assistant-message component, and scoped chat CSS.',
        status: 'working',
      },
      {
        path: '/frontend-tools-generative-ui',
        hasDemo: true,
        title: 'Frontend tools and generative UI',
        docPath: '/angular/ag2/guides/frontend-tools-generative-ui',
        summary:
          'A server-side tool call rendered by an Angular component, plus the sandboxed Open Generative UI path.',
        status: 'working',
        statusNote:
          'Both halves reach the agent: AG2 streams its own tool calls, and a tool sent in RunAgentInput.tools comes back as a TOOL_CALL_CHUNK that ends the run for the browser to answer.',
      },
      {
        path: '/a2ui',
        hasDemo: true,
        title: 'A2UI schemas, styling, and recovery',
        docPath: '/angular/ag2/guides/a2ui',
        summary:
          'Declarative generative UI driven by the runtime A2UI middleware, with the guide’s recovery thresholds and catalog CSS.',
        status: 'broken',
        statusNote:
          'Inert. /info reports a2uiEnabled: true, but supplying a2ui.catalog is what actually registers the render_a2ui renderer — and the guide’s catalog snippet is not self-contained. See Known issues.',
      },
      {
        path: '/voice-multimodal',
        hasDemo: true,
        title: 'Voice and multimodal input',
        docPath: '/angular/ag2/guides/voice-multimodal',
        summary:
          'The built-in microphone control, an attachments config, and a programmatically constructed multimodal message.',
        status: 'broken',
        statusNote:
          'The microphone renders and records, but this repo’s runtime has no transcription service configured, so transcription fails and the guide never says one is required.',
      },
      {
        path: '/human-in-the-loop',
        hasDemo: true,
        title: 'Human-in-the-loop and interrupts',
        docPath: '/angular/ag2/guides/human-in-the-loop',
        summary:
          'A decision tool that pauses the run until the user answers, plus a headless interrupt controller.',
        status: 'working',
        statusNote:
          'The registerHumanInTheLoop path is live. The interrupt half of the page cannot run here: ag2.ag_ui emits no interrupt event, so injectInterrupt and store().interruptController stay idle forever. See Known issues.',
      },
      {
        path: '/shared-state',
        hasDemo: true,
        title: 'Shared state and agent context',
        docPath: '/angular/ag2/guides/shared-state',
        summary:
          'Reading and writing agent state through injectAgentStore, and publishing read-only app context two ways.',
        status: 'broken',
        statusNote:
          'Reads work; writes are dropped. AG2 merges the incoming AG-UI state under its own agent variables, so agent.setState never reaches the model. There is also no STATE_DELTA, so state only moves at the edges of a run. See Known issues.',
      },
    ],
  },
  {
    title: 'Threads, memory, attachments, headless',
    routes: [
      {
        path: '/threads',
        hasDemo: true,
        title: 'Threads',
        docPath: '/angular/ag2/guides/threads-memory-attachments-headless',
        summary:
          'A hand-built thread list on injectThreads, and the drop-in CopilotThreadsDrawer beside a chat.',
        status: 'partial',
        premium: true,
        statusNote:
          'Thread endpoints come from the Enterprise Intelligence Platform. Unlicensed, the list stays empty and the drawer renders its locked state — which is the expected result here.',
      },
      {
        path: '/memory',
        hasDemo: true,
        title: 'Memory',
        docPath: '/angular/ag2/guides/threads-memory-attachments-headless',
        summary:
          'injectMemories with the isAvailable() gate the guide requires before showing memory controls.',
        status: 'partial',
        premium: true,
        statusNote:
          'This runtime does not provide the memory routes, so isAvailable() is false and the guide’s fallback message is what renders.',
      },
      {
        path: '/attachments',
        hasDemo: true,
        title: 'Attachments',
        docPath: '/angular/ag2/guides/threads-memory-attachments-headless',
        summary:
          'An AttachmentsConfig bound to copilot-chat, with the file picker, drag-and-drop, and paste.',
        status: 'working',
        statusNote:
          'An image part reaches the model through AG2’s AG-UI bridge. A malformed part does not degrade: the bridge validates before it opens the stream, so the browser gets a bare HTTP 500 rather than a RUN_ERROR. See Known issues.',
      },
      {
        path: '/headless',
        hasDemo: true,
        title: 'Headless UI',
        docPath: '/angular/ag2/guides/threads-memory-attachments-headless',
        summary:
          'A transcript and composer built from scratch on injectAgentStore and CopilotKitCore.runAgent.',
        status: 'working',
      },
    ],
  },
];

export const ALL_ROUTES: RouteMeta[] = NAV.flatMap((g) => g.routes);

export function findRoute(path: string): RouteMeta | undefined {
  return ALL_ROUTES.find((r) => r.path === path);
}

export function docUrl(route: RouteMeta): string {
  return `https://docs.copilotkit.ai${route.docPath}`;
}

export const STATUS_LABEL: Record<RouteStatus, string> = {
  working: 'Working',
  partial: 'Partial',
  reference: 'Reference',
  broken: 'Broken',
  'not-started': 'Not started',
};
