import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BackendHealth } from '../components/backend-health';
import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode } from '../components/ui';
import { DOC_SYNC_DATE, NAV } from '../lib/nav-config';

@Component({
  selector: 'app-introduction-page',
  imports: [RouterLink, RouteHeader, BackendHealth, Panel, Callout, SourceCode],
  template: `
    <app-route-header path="/" />

    <div class="space-y-6">
      <app-backend-health />

      <ui-panel heading="What this is">
        <p class="text-sm text-slate-700">
          A navigable test harness for the Angular + AG2
          section of the
          CopilotKit docs. Every guide listed in the sidebar is a route, and
          each route runs the thing its doc page teaches rather than restating
          it. Docs were last synced on {{ docSyncDate }}.
        </p>
        <p class="mt-3 text-sm text-slate-700">
          Routes with a live feature are split in two: the route itself holds
          the notes, pass/fail criteria, and the exact source that runs, and
          <code class="rounded bg-slate-100 px-1">&lt;route&gt;/demo</code>
          holds just the running feature with no page chrome.
        </p>
      </ui-panel>

      <ui-panel heading="Architecture">
        <pre
          class="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100"
        ><code>Browser (Angular 22, zoneless)
  &#124;  &#64;copilotkit/angular — provideCopilotKit, copilot-chat, signal APIs
  &#124;  POST http://localhost:8401/api/copilotkit
  v
Copilot Runtime  ·  localhost:8401        &#8592; Node, frontend/server.ts
  &#124;  agents: &#123; default, support &#125; &#8594; new HttpAgent(&#123; url &#125;)
  &#124;  POST http://localhost:8400/agent/  &#8592; AG-UI over SSE
  v
AG2  ·  localhost:8400   &#8592; Python / FastAPI
  &#124;  app.mount("/agent", AGUIStream(agent).build_asgi())
  v
OpenAI  (gpt-4o-mini)</code></pre>

        <p class="mt-3 text-sm text-slate-700">
          Three processes, not two. Unlike the React quickstart — where the
          runtime lives inside the Next app — Angular has no server route, so
          the runtime is its own Node process. The model key only ever reaches
          the AG2 process.
        </p>
      </ui-panel>

      <ui-callout title="Both backends must be running">
        The chat will not stream if either process is down. Start the AG2
        agent with <code>uv run main.py</code> from <code>backend/</code>, and
        the runtime with <code>npm run runtime</code> from
        <code>frontend/</code>.
      </ui-callout>

      <ui-panel heading="Routes">
        <ul class="space-y-4 text-sm">
          @for (group of nav; track group.title) {
            <li>
              <p class="font-semibold text-slate-900">{{ group.title }}</p>
              <ul class="mt-1 space-y-1">
                @for (route of group.routes; track route.path) {
                  <li>
                    <a
                      [routerLink]="route.path"
                      class="text-blue-700 underline decoration-dotted"
                      >{{ route.title }}</a
                    >
                    <span class="text-slate-600"> — {{ route.summary }}</span>
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
      </ui-panel>

      <ui-panel heading="Inspector">
        <p class="text-sm text-slate-700">
          <code>/angular/ag2</code> and
          <code>/angular/ag2/quickstart</code> are the same page, so
          the "Open Inspector and confirm setup" step lands on this route too.
          As of <code>&#64;copilotkit/angular&#64;0.4.0</code> the package
          mounts <code>cpk-web-inspector</code> itself, but only inside a
          running CopilotKit surface and only in dev mode — this notes route
          has neither, so no button appears here.
          <a
            routerLink="/quickstart"
            class="text-blue-700 underline decoration-dotted"
            >The Quickstart route</a
          >
          carries the step, its three checks, and what was found against them.
        </p>
      </ui-panel>

      <ui-panel heading="The runtime binding">
        <p class="mb-3 text-sm text-slate-700">
          This is the one file that ties CopilotKit to the AG2 backend. It is
          read off disk at build time, so what you see is what runs.
        </p>
        <ui-source path="server.ts" />
      </ui-panel>
    </div>
  `,
})
export default class IntroductionPage {
  protected readonly nav = NAV;
  protected readonly docSyncDate = DOC_SYNC_DATE;
}
