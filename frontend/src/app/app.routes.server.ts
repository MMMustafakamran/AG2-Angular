import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * CopilotKit's chat surfaces, the agent store, and this harness's connection
 * probe are all browser-only, so every route renders on the client. The server
 * still serves the app shell.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
