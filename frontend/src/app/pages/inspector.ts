import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RouteHeader } from '../components/route-header';
import { Callout, DocSample, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-inspector-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode, DocSample, RouterLink],
  template: `
    <app-route-header path="/inspector" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo, send a message, then click the Inspector launcher in
          the top-right corner and walk the quickstart's confirm-setup step:
          open <strong>Agents</strong>, pick <code>default</code> in the sidebar
          agent selector, then open <strong>AG-UI Events</strong>.
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> the strip at the top of the demo reads
          <code>cpk-web-inspector mounted</code> with one element on
          <code>document.body</code>, the launcher is there without this repo
          mounting anything, the Agent panel shows <code>default</code> once
          selected, and <strong>AG-UI Events</strong> has the run's events in
          it. <strong>Fail:</strong> no launcher, or the strip stays on
          <code>no cpk-web-inspector</code> — check you are on
          <code>ng serve</code> and not a production build, which is the one
          case where it never appears.
        </p>
        <p class="mt-2 text-slate-700">
          Note the extra step. The quickstart says
          <em>"Open Agents, then Agent. Your agent is listed"</em>, but the
          panel opens on <code>No agent selected</code> — the agent appears only
          after picking it from the sidebar selector, which the step does not
          mention. The recorder performs both halves and logs each state.
        </p>
      </ui-try-it>

      <ui-callout title="This page was untracked until 2026-09-01">
        The quickstart's closing step has always ended
        <em>"More detail: Inspector"</em>, pointing at
        <code>/angular/ag2/inspector</code> — but the page was in neither
        <code>DOC_PAGES</code> nor <code>doc-snapshot/manifest.json</code>, so
        the nightly drift check had never once looked at it. That is the first
        item on <code>project-context.md</code>'s list of gaps the pipeline
        misses: a page with no entry produces no diff and no failure, so nothing
        ever said it was untested. Drift now covers 10 pages instead of 9.
      </ui-callout>

      <ui-panel heading="Nothing to install, nothing to mount">
        <p class="mb-3 text-sm text-slate-700">
          <code>&#64;copilotkit/angular</code> depends on
          <code>&#64;copilotkit/web-inspector</code> directly, so there is no
          package to add and no version to pin. The <code>CopilotKit</code>
          service creates <code>cpk-web-inspector</code>, hands it the
          application's core, and appends it to <code>document.body</code> after
          the first browser render.
        </p>
        <p class="text-sm text-slate-700">
          That is why this route's demo is just a chat: it exists to give the
          Inspector something to inspect. Something has to
          <em>inject</em> the service — Angular constructs a root-provided
          service lazily, so a route that configures CopilotKit but renders no
          consumer has no Inspector, which is why no launcher appears on these
          notes routes.
        </p>
      </ui-panel>

      <ui-panel heading="The demo">
        <p class="mb-3 text-sm text-slate-700">
          A chat and nothing else — the emptiness is the evidence. It mounts no
          Inspector, and the launcher is there anyway.
        </p>
        <ui-source path="src/app/features/inspector/inspector-chat.component.ts" />
      </ui-panel>

      <ui-panel heading="The mount check">
        <p class="mb-3 text-sm text-slate-700">
          The demo route carries a probe strip above the chat. It is not
          something the guide asks for: it counts
          <code>cpk-web-inspector</code> elements in the document and names
          which of the guide's three cases it found — exactly one
          (<strong>mounted</strong>, the documented result), none
          (<strong>absent</strong>, nothing on the route has injected the
          <code>CopilotKit</code> service yet), or more than one
          (<strong>duplicate</strong>, the state a leftover hand-written mount
          produces). Without it the only evidence in a recording is a launcher
          in one corner of the frame, which is not something a viewer can read.
        </p>
        <ui-source path="src/app/features/inspector/inspector-probe.component.ts" />
      </ui-panel>

      <ui-panel heading="Turning it off">
        <p class="mb-3 text-sm text-slate-700">
          Angular controls visibility through <code>provideCopilotKit</code>:
        </p>
        <ui-doc-sample
          caption="src/app/app.config.ts — from the guide"
          [code]="enableInspectorSample"
        />
        <p class="mt-3 text-sm text-slate-700">
          This repo does not set <code>enableInspector</code>, so it takes the
          default. The shipped gate is
          <code
            >isBrowser &amp;&amp; isDevelopment &amp;&amp; enableInspector !==
            false</code
          >: opting out is explicit, but opting <em>in</em> on a production
          build is not possible — an explicit <code>true</code> never overrides
          a production or server environment.
        </p>
        <div class="mt-4">
          <ui-source path="src/app/app.config.ts" />
        </div>
      </ui-panel>

      <ui-callout
        tone="warn"
        title="Finding — the quickstart says “on localhost”; the code says “in dev mode”"
      >
        Carried over from
        <a
          routerLink="/quickstart"
          class="text-blue-700 underline decoration-dotted"
          >the Quickstart route</a
        >, because it is the same gate. The step conditions the Inspector on
        <em>localhost</em>; <code>isDevelopment</code> is Angular's
        <code>isDevMode()</code>, not a hostname check, so a production build
        served from localhost has no Inspector button at all. This page's own
        "Production and server rendering" section says there is nothing to do
        for either, which is true of the code and unhelpful to a reader who
        followed the quickstart against a built bundle and found nothing.
      </ui-callout>

      <ui-panel heading="Production and server rendering">
        <p class="text-sm text-slate-700">
          The guide says "nothing to do for either", and the reasons are
          checkable. The <code>&#64;copilotkit/web-inspector</code> import is a
          dynamic <code>import()</code> inside the service, so the bundler
          splits it into its own chunk that a production build never requests.
          Mounting runs in <code>afterNextRender</code> behind an
          <code>isPlatformBrowser</code> check, so the element is never created
          during a server render — which matters because the web component
          registers itself against <code>customElements</code>, and that does
          not exist on the server. This repo ships SSR, so both paths are live
          here.
        </p>
      </ui-panel>

      <ui-panel heading="Positioning the launcher">
        <p class="mb-3 text-sm text-slate-700">
          The launcher defaults to the top-right and positions itself with an
          inline transform, so an override has to neutralise that transform
          before choosing a corner:
        </p>
        <ui-doc-sample
          caption="src/styles.css — from the guide, not applied here"
          language="css"
          [code]="positionSample"
        />
        <p class="mt-3 text-sm text-slate-700">
          Left unapplied on purpose. The default corner is what the Quickstart
          step tells a reader to look for, so moving it here would make this
          harness disagree with the page it is testing.
        </p>
      </ui-panel>

      <ui-callout title="No hand-written mount to retract">
        The guide warns that a <code>WebInspector</code> component from before
        <strong>0.4.0</strong> must be deleted, not merely left alone: the
        framework reuses an existing <code>cpk-web-inspector</code>, but the
        hand-written component's <code>DestroyRef.onDestroy</code> removes that
        element unconditionally, so a route change tears out the Inspector the
        framework is now driving and it does not come back without a full
        reload. This repo never mounted one by hand, so the upgrade to 0.4.0
        carried no retraction — the warning is verified as not applicable rather
        than skipped.
      </ui-callout>
    </div>
  `,
})
export default class InspectorPage {
  protected readonly enableInspectorSample = `provideCopilotKit({
  runtimeUrl: "http://localhost:8200/api/copilotkit",
  enableInspector: false, // hide it during development
});`;

  protected readonly positionSample = `cpk-web-inspector {
  /* The panel is draggable and sets an inline transform. Neutralize it before
     choosing a corner. */
  transform: none !important;
  top: auto !important;
  bottom: 1rem !important;
  left: 1rem !important;
  right: auto !important;
}`;
}
