import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, DocSample, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-tools-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode, DocSample],
  template: `
    <app-route-header path="/frontend-tools-generative-ui" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-[var(--ink-soft)]">
          Open the demo. Send <em>What's the weather in Tokyo?</em>, then
          <em>Change the background to violet</em>, then
          <em>Show me incident INC-4711, severity sev1.</em> — one prompt per
          registration path. The third is the guide's new first section, and it
          is where the findings are.
        </p>
        <p class="mt-2 text-[var(--ink-soft)]">
          <strong>Pass (server-side tool):</strong> the call renders through
          <code>WeatherCardComponent</code> — "Loading weather for Tokyo" for
          about a second and a half, then the city in bold with the result
          beneath.
          <strong>Fail:</strong> a plain-text answer with no card, which means
          the renderer name and the agent's tool name have drifted apart.
        </p>
        <p class="mt-2 text-[var(--ink-soft)]">
          <strong>Pass (browser-executed tool):</strong> the demo panel repaints
          to a violet gradient the moment the call completes, and
          <em>nothing</em> renders in the chat for it — that tool has a handler
          and no component. Try <em>sunset</em>, <em>forest</em>,
          <em>#0ea5e9</em>, or a full <code>linear-gradient(...)</code> too.
          <strong>Fail:</strong> the agent claims it changed the background but
          the panel stays grey — the handler never ran.
        </p>
        <p class="mt-2 text-[var(--ink-soft)]">
          <strong>If nothing renders at all,</strong> check the AG-UI stream for
          a <code>TOOL_CALL_START</code>. On a long thread the model often
          answers from conversation history instead of calling the tool, and no
          tool call means nothing for the renderer to draw. Start a fresh thread
          before concluding the registration is broken.
        </p>
      </ui-try-it>

      <ui-panel heading="Let the agent display one of your components">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          The guide's new first section: display-only generative UI. There is no
          <code>handler</code> and nothing changes on the agent side — the tool
          is declared by the frontend and forwarded over AG-UI. That much holds
          here: <code>show_incident</code> is declared by the browser and the AG2
          process in <code>backend/main.py</code> is untouched. Both snippets are
          reproduced verbatim below, and both are mounted and running.
        </p>

        <ui-doc-sample
          caption="the guide's registerComponent registration"
          [code]="registerComponentSample"
        />

        <p class="mt-4 mb-3 text-sm text-[var(--ink-soft)]">
          The component it points at, in the repo verbatim:
        </p>
        <ui-source
          path="src/app/features/tools/incident-card.component.ts"
          note="the guide's snippet, unmodified — the defects below are its own"
        />

        <div class="mt-4 space-y-3">
          <ui-callout
            tone="warn"
            title="The agent apologises for the card it just drew"
          >
            The registration carries no <code>handler</code>, so core returns an
            empty tool result. The model reads that emptiness as failure and
            posts a second message contradicting the correct card above it —
            <em>"It seems there was an issue retrieving the details for incident
            INC-4711…"</em> — on every run.
            <br /><br />
            <code>followUp: false</code> suppresses the follow-up turn entirely:
            one message, the card, nothing else.
            <code>RegisterComponentConfig</code> carries the field and the guide
            never mentions it. Left off here, because the default is what the
            page teaches.
          </ui-callout>

          <ui-callout
            tone="warn"
            title="The loading guard never fires, and the status never completes"
          >
            The snippet gates on
            <code>call.status === "in-progress"</code>. The status observed while
            arguments stream is <code>"executing"</code>, so the guard never
            fires and the <code>&#64;else</code> branch renders with empty args —
            a blank card for a beat before the values land.
            <br /><br />
            The status then never reaches <code>"complete"</code> at all: sampled
            once a second for 25 seconds, it read <code>"executing"</code>
            throughout. That matters because the
            <code>registerRenderToolCall</code> snippet further down this same
            page gates its content on <code>"complete"</code>, and the prose
            above it states the status "moves through
            <code>"in-progress"</code>, <code>"executing"</code>, and
            <code>"complete"</code>". Apply that documented pattern to a
            display-only tool and it renders its loading branch forever.
          </ui-callout>

          <ui-callout tone="warn" title="The card is not a card">
            The snippet ships no CSS and pairs an inline <code>&lt;strong&gt;</code>
            with an inline <code>&lt;span&gt;</code>. Angular's default
            <code>preserveWhitespaces: false</code> strips the gap between the
            two tags, so the rendered DOM is
            <code
              >&lt;article&gt;&lt;strong&gt;INC-4711&lt;/strong&gt;&lt;span&gt;sev1&lt;/span&gt;&lt;/article&gt;</code
            >
            and the "card" reads as <code>INC-4711sev1</code>. Nothing is
            restyled here — on the generative UI page, the example's own output
            is the finding.
          </ui-callout>

          <ui-callout tone="info" title="Three smaller gaps in the same section">
            The registration is a bare <code>ts</code> fence with no
            <code>title</code> and no imports, so <code>registerComponent</code>
            and <code>z</code> are undefined identifiers as published.
            <br /><br />
            The section never says it must be called from an Angular injection
            context — the phrase appears once on this page, in the
            <code>registerFrontendTool</code> section below — though the API
            reference requires one.
            <br /><br />
            The <code>description</code> you write is not what the model
            receives. Core prepends a fixed preamble, so
            <code>"Show one incident from the incident table."</code> arrives as
            <code
              >"Use this tool to display the "show_incident" component in the
              chat. This tool renders a visual UI component for the user.

Show
              one incident from the incident table."</code
            >
          </ui-callout>

          <ui-callout tone="info" title="Two renderers, one page, two shapes">
            The older "Render a tool result" snippet on this same page imports
            <code
              >{{ '{' }} type AngularToolCall, type ToolRenderer
              {{ '}' }}</code
            >
            and sets no <code>standalone</code>. The new snippet imports the
            same two symbols as values and sets <code>standalone: true</code>.
            Same page, same package, two import styles and two decorator shapes,
            with nothing saying which is meant. The new one also violates this
            repo's own house rule — <code>frontend/AGENTS.md</code>: components
            "Must NOT set <code>standalone: true</code> inside Angular
            decorators" — which the older snippet respects, and its value
            imports fail under <code>verbatimModuleSyntax</code> with
            <code>TS1484</code> where the older style compiles clean. Both are
            kept verbatim regardless; the conflict is the record.
          </ui-callout>
        </div>
      </ui-panel>

      <ui-panel heading="Render a tool result">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          A renderer is a standalone component with a required
          <code>toolCall</code> signal input. Its status moves through
          <code>"in-progress"</code>, <code>"executing"</code>, and
          <code>"complete"</code>.
        </p>
        <ui-source path="src/app/features/tools/weather-card.component.ts" />
      </ui-panel>

      <ui-panel heading="registerRenderToolCall — server-side tool, browser renders">
        <p class="text-sm text-[var(--ink-soft)]">
          The AG2 agent owns the weather tool; the browser only
          renders its call. The registration is in
          <code>tools-chat.component.ts</code>, shown in full below alongside
          the browser-executed tool.
        </p>
      </ui-panel>

      <ui-callout tone="warn" title="Name and arguments are two separate contracts">
        <code>registerRenderToolCall({{ '{' }} name {{ '}' }})</code> matches the
        agent's tool by exact string, and a mismatch fails silently: the tool
        still runs and the agent still answers, you just get plain text where
        the card should be. The AG2 agent in <code>backend/main.py</code>
        therefore publishes its tool as <code>getWeather</code> — AG2's
        <code>&#64;tool(name=…)</code>, not the Python function name — so the
        guide's registration binds.
        <br /><br />
        The arguments do not. The guide's card reads
        <code>call.args.city</code> throughout, while the tool's parameter is
        <code>location</code>, so the card's heading renders empty and its
        loading line falls through to its <code>…</code> placeholder while the
        agent answers correctly. The guide never states the argument contract
        it depends on.
      </ui-callout>

      <ui-panel heading="Open Generative UI — sandboxed host functions">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          The guide's <code>setDashboardFilter</code> sandbox function is
          registered at the application root. Generated code runs in a sandboxed
          iframe with no same-origin access and can call only the host functions
          listed in <code>sandboxFunctions</code>.
        </p>
        <ui-source path="src/app/app.config.ts" />
      </ui-panel>

      <ui-panel heading="registerFrontendTool — the tool runs in the browser">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          <code>change_background</code> has a handler and no component, so it
          renders nothing in the chat — its result is the page itself changing.
          The registration is removed when the owning injector is destroyed.
        </p>
        <ui-source
          path="src/app/features/tools/tool-feature-model.ts"
          note="createBackgroundTool is the guide's; the rest is ours"
        />

        <p class="mt-4 mb-3 text-sm text-[var(--ink-soft)]">
          The guide quotes <code>createBackgroundTool</code> from the live
          Showcase without its <code>BackgroundToolArgs</code> type, its
          <code>resolveGradient</code> helper, or its imports, so the snippet
          cannot compile as published. Those three are defined here to make it
          runnable — <code>createBackgroundTool</code> itself is unchanged.
          <code>resolveGradient</code> accepts a preset name, a bare CSS color,
          or a full gradient, so the agent can ask for a look without having to
          write valid CSS.
        </p>

        <p class="mt-4 mb-3 text-sm text-[var(--ink-soft)]">
          The guide's other <code>registerFrontendTool</code> sample is a second
          <code>getWeather</code> that runs in the browser. It is quoted here
          rather than mounted: the name would collide with the server-side tool
          above, and it fetches an <code>/api/weather</code> endpoint this repo
          does not serve.
        </p>
        <ui-doc-sample
          caption="the guide's browser-executed getWeather"
          [code]="frontendToolSample"
        />
      </ui-panel>

      <ui-panel heading="All three paths, one chat">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          Two registrations run; the third sits commented out beneath them, with
          the errors it produces recorded in place.
        </p>
        <ui-source path="src/app/features/tools/tools-chat.component.ts" />
      </ui-panel>
    </div>
  `,
})
export default class FrontendToolsPage {
  /**
   * "Let the agent display one of your components", snippet 2, verbatim. The
   * guide fences it bare — no title, no imports — so where `z` and
   * `IncidentCardComponent` come from is left to the reader.
   */
  protected readonly registerComponentSample = `registerComponent({
  name: "show_incident",
  description: "Show one incident from the incident table.",
  parameters: z.object({
    id: z.string().describe("The incident id, such as INC-4711"),
    severity: z.string().describe("One of sev1, sev2, sev3"),
  }),
  component: IncidentCardComponent,
});`;

  protected readonly frontendToolSample = `registerFrontendTool({
  name: "getWeather",
  description: "Get the current weather for a city",
  parameters: z.object({ city: z.string() }),
  component: WeatherCardComponent,
  handler: async ({ city }, { signal }) => {
    const response = await fetch(\`/api/weather?city=\${encodeURIComponent(city)}\`, {
      signal,
    });
    return response.text();
  },
});`;
}
