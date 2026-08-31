import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, DocSample, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-a2ui-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode, DocSample],
  template: `
    <app-route-header path="/a2ui" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo and ask for something with structure, e.g.
          <em>Show me a card comparing two flight options.</em>
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> a rendered declarative surface appears in the
          chat instead of a wall of text.
          <strong>Fail:</strong> raw JSON or protocol operations printed as
          text, which means the runtime middleware is not applied.
        </p>
      </ui-try-it>

      <ui-callout tone="warn" title="The catalog is the switch">
        A2UI needs nothing at the component level, but it does need a catalog.
        The server half is <code>a2ui: {{ '{}' }}</code> on
        <code>CopilotRuntime</code>, which applies
        <code>A2UIMiddleware</code> to every registered agent — necessary, but
        not sufficient. Supplying <code>a2ui.catalog</code> to
        <code>provideCopilotKit</code> is what registers the
        <code>render_a2ui</code> renderer and pushes the catalog id, component
        schemas, and generation guidelines into agent context. No catalog is
        set here, so nothing renders — the guide's "the A2UI renderer activates
        automatically, no extra configuration is needed" reads as if the server
        half were enough.
      </ui-callout>

      <ui-panel heading="Server half — A2UIMiddleware for all agents">
        <ui-source path="server.ts" />
      </ui-panel>

      <ui-panel heading="Browser half — recovery thresholds only">
        <p class="mb-3 text-sm text-slate-700">
          The guide's recovery policy is set here:
          <code>showAfterMs</code> avoids flashing recovery UI during a normal
          pause, and <code>showAfterAttempts</code> waits through transient
          retries. <code>debugExposure</code> is left unset, so protocol
          diagnostics stay hidden.
        </p>
        <ui-source path="src/app/app.config.ts" />
      </ui-panel>

      <ui-panel heading="Catalog CSS">
        <p class="mb-3 text-sm text-slate-700">
          The guide's catalog stylesheet is in the global stylesheet verbatim.
          Its <code>--line</code> and <code>--muted</code> variables are not
          defined by the guide, so this harness defines them in a token block
          just above.
        </p>
        <ui-source path="src/styles.css" note="see the A2UI guide section" />
      </ui-panel>

      <ui-panel heading="Why no custom catalog is registered">
        <p class="mb-3 text-sm text-slate-700">
          The guide's schema-strategy snippets are excerpts from the live
          Showcase. <code>fixedDefinitions</code> references a
          <code>dynamicString</code> helper that is never shown, and
          <code>a2uiConfigForFeature</code> references three catalogs
          (<code>beautifulCatalog</code>, <code>declarativeCatalog</code>,
          <code>fixedCatalog</code>) that are never defined — nor is the
          <code>createCatalog</code> call that would turn definitions into a
          catalog. Registering one would mean inventing code the guide does not
          give, so this route runs on the default catalog instead.
        </p>
        <ui-doc-sample
          caption="A2UI guide — fixed catalog definitions (not self-contained)"
          [code]="fixedDefinitionsSample"
        />
        <div class="mt-4">
          <ui-doc-sample
            caption="A2UI guide — catalog selection (not self-contained)"
            [code]="catalogSelectionSample"
          />
        </div>
      </ui-panel>

      <ui-callout tone="warn" title="Angular support boundaries">
        The guide states two of these as authoritative framework support states
        rather than missing examples: <strong>Hashbrown is unsupported</strong>
        on Angular 20–22 and must not be added, and the
        <strong>JSON Renderer has no Angular renderer</strong>. A2UI with a
        typed catalog is the documented path for declarative Angular
        interfaces.
      </ui-callout>
    </div>
  `,
})
export default class A2uiPage {
  protected readonly fixedDefinitionsSample = `// features/a2ui/a2ui-catalogs.ts
const fixedDefinitions = {
  Card: { props: z.object({ child: z.string() }) },
  Title: { props: z.object({ text: dynamicString }) },
  Airport: { props: z.object({ code: dynamicString }) },
  Arrow: { props: z.object({}) },
  AirlineBadge: { props: z.object({ name: dynamicString }) },
  PriceTag: { props: z.object({ amount: dynamicString }) },
  Button: {
    props: z.object({
      child: z.string(),
      variant: z.enum(["primary", "secondary", "ghost"]).optional(),
      action: z.unknown().optional(),
    }),
  },
};`;

  protected readonly catalogSelectionSample = `// features/a2ui/a2ui-catalogs.ts
export function a2uiConfigForFeature(feature: string): A2UIConfig | undefined {
  switch (feature) {
    case "beautiful-chat":
      return { catalog: beautifulCatalog };
    case "declarative-gen-ui":
      return { catalog: declarativeCatalog };
    case "a2ui-recovery":
      return {
        catalog: declarativeCatalog,
        recovery: { showAfterMs: 2_000, showAfterAttempts: 2 },
      };
    case "a2ui-fixed-schema":
      return { catalog: fixedCatalog };
    default:
      return undefined;
  }
}`;
}
