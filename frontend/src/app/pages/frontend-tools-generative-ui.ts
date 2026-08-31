import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-tools-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/frontend-tools-generative-ui" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-[var(--ink-soft)]">
          Open the demo. Send <em>What's the weather in Tokyo?</em>, then
          <em>Change the background to violet</em> — one tool per path.
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
      </ui-panel>

      <ui-panel heading="Both registrations, one chat">
        <ui-source path="src/app/features/tools/tools-chat.component.ts" />
      </ui-panel>
    </div>
  `,
})
export default class FrontendToolsPage {
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
