import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-quickstart-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/quickstart" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo and send <em>Can you tell me a joke?</em>
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> tokens stream in one at a time and render as
          markdown.
          <strong>Fail:</strong> nothing streams — check the connection panel on
          the Introduction route; one of the two backends is down.
        </p>
      </ui-try-it>

      <ui-panel heading="1 · The runtime, with an HttpAgent">
        <p class="mb-3 text-sm text-slate-700">
          The Angular quickstart's backend step defers to the selected
          integration: "Configure Copilot Runtime to register this backend as
          the <code>default</code> agent at <code>/api/copilotkit</code>." So
          the Node server below is the quickstart's, with
          <code>BuiltInAgent</code> replaced by the generic
          <code>HttpAgent</code> from <code>&#64;ag-ui/client</code> — the
          binding for any AG-UI-over-HTTP server, which is exactly what
          <code>AGUIStream(agent).build_asgi()</code> mounts in the AG2
          backend. The URL needs its trailing slash: a Starlette mount answers
          the slashless <code>POST /agent</code> with a 307, and
          <code>HttpAgent</code> does not re-post.
        </p>
        <ui-source path="server.ts" />
      </ui-panel>

      <ui-panel heading="2 · Import the styles">
        <p class="mb-3 text-sm text-slate-700">
          The package stylesheet is self-contained — the chat renders without
          any other CSS. It is the first import in the global stylesheet, ahead
          of this harness's own chrome.
        </p>
        <ui-source path="src/styles.css" note="first ~10 lines are the doc step" />
      </ui-panel>

      <ui-panel heading="3 · Connect to Copilot Runtime">
        <p class="mb-3 text-sm text-slate-700">
          One provider at the application root. The extra
          <code>a2ui</code> and <code>openGenerativeUI</code> options belong to
          later guides; the quickstart needs only <code>runtimeUrl</code>.
        </p>
        <ui-source path="src/app/app.config.ts" />
      </ui-panel>

      <ui-panel heading="4 · Add the chat UI">
        <ui-source path="src/app/features/quickstart/quickstart-chat.ts" />
      </ui-panel>

      <ui-callout title="Verify the runtime before blaming the frontend">
        The quickstart's troubleshooting box prescribes one check:
        <code>http://localhost:8401/api/copilotkit/info</code> should report the
        registered agents. The Introduction route probes exactly that.
      </ui-callout>

      <ui-panel heading="5 · Open Inspector and confirm setup">
        <p class="mb-3 text-sm text-slate-700">
          The final step no longer routes Angular readers through a manual
          mount. As published on 2026-08-30 it reads, in full:
          <em>"On localhost, click the Inspector button in the corner of the
          app."</em> Nothing here mounts the Inspector — the step is testing
          that <code>&#64;copilotkit/angular</code> mounts it for you, which
          landed in <code>0.4.0</code>.
        </p>
        <p class="mb-3 text-sm text-slate-700">
          The button belongs to the running app, not to a notes page, so it
          appears on <code>/quickstart/demo</code> rather than on this route.
          The three checks the step then prescribes:
        </p>
        <ol
          class="ml-5 list-decimal space-y-1 text-sm text-slate-700 marker:text-slate-400"
        >
          <li>
            Open <strong>Agents</strong>, then <strong>Agent</strong>. Your
            agent is listed.
          </li>
          <li>
            Send a chat message. Open <strong>Agents</strong>, then
            <strong>AG-UI Events</strong>. Events are moving.
          </li>
          <li>
            Open <strong>Threads</strong>. The list is unlocked (Intelligence is
            on), or locked with Enable Intelligence (Intelligence is off). This
            repo runs no license key, so <strong>locked is the pass</strong>
            here — see the Threads route.
          </li>
        </ol>
      </ui-panel>

      <ui-callout
        tone="warn"
        title="Finding — the step says “on localhost”; the code says “in dev mode”"
      >
        <p>
          The step conditions the Inspector on <em>localhost</em>. The shipped
          gate is
          <code
            >shouldEnableInspector(&#123; enableInspector, isBrowser,
            isDevelopment &#125;)</code
          >, which returns
          <code>isBrowser &amp;&amp; isDevelopment &amp;&amp; enableInspector
          !== false</code>
          — and <code>isDevelopment</code> is Angular's
          <code>isDevMode()</code>, not a hostname check. A production build
          served from localhost has no Inspector button at all.
        </p>
        <p class="mt-2">
          Confirmed on this harness at
          <code>&#64;copilotkit/angular&#64;0.4.0</code> (declared
          <code>^0.4.0</code>): the <code>cpk-web-inspector</code> element
          mounts on <code>/quickstart/demo</code> under <code>ng serve</code>
          and is absent from every route of the built bundle served over
          <code>http://localhost</code>. A reader following the step against a
          production build finds nothing, and has no way to tell that from a
          broken setup.
        </p>
      </ui-callout>

      <ui-callout
        tone="warn"
        title="Finding — the step is unreachable on the version the previous docs pinned"
      >
        The mount landed in <code>&#64;copilotkit/angular&#64;0.4.0</code>.
        <code>0.3.1</code> — <code>latest</code> on npm until this release,
        and what this repo declared until the step was reconciled — contains
        no Inspector code whatsoever. Between the two, the page told Angular
        readers to click a button their installed package could not render, and
        the removed line pointed at
        <code>/angular/ag2/inspector</code> for the manual mount
        that replaced it. Anyone pinned below <code>0.4.0</code> now reads a
        step with no fallback and no version note.
      </ui-callout>
    </div>
  `,
})
export default class QuickstartPage {
  protected readonly builtInAgentSample = `const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: "openai:gpt-5-mini",
      prompt: "You are a helpful assistant for an Angular app.",
    }),
  },
});`;
}
