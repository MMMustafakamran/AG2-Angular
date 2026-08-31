# A2UI schemas, styling, and recovery

> Configure typed A2UI catalogs, Angular-owned styles, and incomplete-stream recovery.

A2UI renders declarative interface operations and snapshots inside Angular
chat. Configure it with a catalog of allowed components; the renderer creates
only components that the catalog defines.

## What is A2UI?

A2UI is CopilotKit's declarative generative UI path for Angular. Instead of
asking an agent to emit arbitrary component code, you give it a typed catalog
and render only the operations that match that catalog.

## Choose a schema strategy

Catalog component definitions use Zod schemas for their props. A broad catalog
lets the agent compose several application primitives. A fixed catalog narrows
the generated interface to a specific domain and set of shapes.

The flight example keeps its component vocabulary deliberately small:

```typescript
// features/a2ui/a2ui-catalogs.ts
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
};
```

Give each catalog a stable `catalogId`, then select it in the `a2ui` option
passed to `provideCopilotKit`. The Showcase chooses a general catalog, a fixed
flight catalog, or the recovery variant from the active feature:

```typescript
// features/a2ui/a2ui-catalogs.ts
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
}
```

In an application config, pass the chosen catalog and lifecycle policy through
the Angular provider:

```ts title="src/app/app.config.ts"
provideCopilotKit({
  runtimeUrl: "/api/copilotkit",
  a2ui: {
    catalog: productCatalog,
    recovery: { showAfterMs: 2_000, showAfterAttempts: 2 },
  },
});
```

By default, CopilotKit includes the catalog schema in agent context. Set
`includeSchema: false` only when the server already supplies equivalent schema
and generation instructions. Otherwise the agent cannot reliably know which
components and props are valid.

## Style rendered components

Catalog renderers return web-component templates with application-owned class
names. Style those classes in the global stylesheet so generated surfaces and
their nested elements receive the same rules:

```css
/* styles.css */
.a2ui-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  width: 100%;
}

.a2ui-row > * {
  flex: 1 1 10rem;
  min-width: 0;
}

.a2ui-column {
  display: flex;
  flex-direction: column;
  width: 100%;
}

[data-testid="declarative-card"],
.a2ui-chart-card,
.a2ui-flight-card {
  display: block;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: white;
  box-shadow: 0 8px 22px -18px rgb(15 23 42 / 0.4);
}

.a2ui-metric {
  display: grid;
  min-width: 8rem;
  gap: 0.25rem;
}

.a2ui-metric > span,
.a2ui-metric > small {
  color: var(--muted);
  font-size: 0.75rem;
}

.a2ui-metric > strong {
  font-size: 1.4rem;
}

.a2ui-status,
.a2ui-airline {
  display: inline-flex;
  width: fit-content;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: #eef2ff;
  font-size: 0.75rem;
  font-weight: 700;
}

.a2ui-status-success {
  background: #dcfce7;
  color: #166534;
}
.a2ui-status-warning {
  background: #fef3c7;
  color: #92400e;
}
.a2ui-status-error {
  background: #fee2e2;
  color: #991b1b;
}
```

Keep semantic state in explicit classes such as `a2ui-status-success` rather
than asking the model to invent colors. You can also pass an A2UI `theme`
through `provideCopilotKit` for renderer-level theme values; catalog CSS
remains the right place for product-specific layout and visual states.

## Recover incomplete streams

An interrupted stream can leave an A2UI surface without a terminal lifecycle
event. Configure `recovery.showAfterMs` to avoid flashing recovery UI during a
normal pause and `recovery.showAfterAttempts` to wait through transient retry
attempts. The Showcase uses two seconds and two attempts, as shown in the
catalog-selection snippet above.

Use `recovery.debugExposure` only when users should see protocol diagnostics.
Keep it hidden in consumer-facing chat, or choose a collapsed or verbose mode
for internal debugging. Recovery thresholds affect client display; the server
still owns activity lifecycle status and retry behavior.

## Angular support boundaries

- **Hashbrown is unsupported.** The stable Hashbrown Angular package does not support the Angular 22 policy.
  Do not add it to an Angular integration; use A2UI with a typed catalog instead.
- **JSON Renderer is not applicable.** JSON Renderer does not provide an Angular renderer; use A2UI for declarative Angular interfaces.

These are authoritative framework support states, not missing examples.

## Next steps

- [Dynamic catalog](/angular/ag2/features#declarative-gen-ui)
- [Fixed schema](/angular/ag2/features#a2ui-fixed-schema)
- [Recovery behavior](/angular/ag2/features#a2ui-recovery)
- [Other generative UI paths](/angular/ag2/guides/frontend-tools-generative-ui)
