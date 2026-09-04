# Doc drift changelog

What the CopilotKit Angular + AG2 docs changed under this repo.
Only pages that actually moved are recorded — a sync that finds everything unchanged writes nothing here at all.

Holds the 3 most recent dated entries. When a change lands on a fourth date, the oldest entry is dropped.

## 2026-09-04

### 07:57 UTC — 3 pages, highest severity high

**Low — Angular**

`/angular/ag2` · route `/` · under “Next steps”

0 code lines, 2 prose lines changed.

```diff
  
  - [Runtime and backend docs](backend/copilot-runtime): configure the server, secure requests, and deploy without leaving the selected Angular surface.
- - [CopilotKit Intelligence](premium/overview): add durable threads, inspection, and cloud-hosted or self-hosted operations.
+ - [CopilotKit Intelligence](intelligence/overview): add durable threads, inspection, and cloud-hosted or self-hosted operations.
  - [Angular task guides](guides/chat-ui): build chat UI, tools, generative UI, interrupts, shared state, threads, memory, attachments, and headless UI.
```

**Low — Angular**

`/angular/ag2/quickstart` · route `/quickstart` · under “Next steps”

0 code lines, 2 prose lines changed.

```diff
  
  - [Runtime and backend docs](backend/copilot-runtime): configure the server, secure requests, and deploy without leaving the selected Angular surface.
- - [CopilotKit Intelligence](premium/overview): add durable threads, inspection, and cloud-hosted or self-hosted operations.
+ - [CopilotKit Intelligence](intelligence/overview): add durable threads, inspection, and cloud-hosted or self-hosted operations.
  - [Angular task guides](guides/chat-ui): build chat UI, tools, generative UI, interrupts, shared state, threads, memory, attachments, and headless UI.
```

**High — Frontend tools and generative UI**

`/angular/ag2/guides/frontend-tools-generative-ui` · route `/frontend-tools-generative-ui` · under “Let the agent display one of your components”

36 code lines, 22 prose lines changed.

```diff
  to the same registration when the tool should show progress or a result in
  chat.
+ 
+ ## Let the agent display one of your components
+ 
+ The simplest generative UI there is, and the only kind that needs nothing on the
+ agent side. `registerComponent` registers a standalone component as a tool the
+ agent can call to show it. The agent decides when, and fills the props.
+ 
+ ```ts title="src/app/incident-card.component.ts"
+ import { Component, input } from "@angular/core";
+ import { AngularToolCall, ToolRenderer } from "@copilotkit/angular";
+ 
+ type IncidentArgs = { id: string; severity: string };
+ 
+ @Component({
+   selector: "app-incident-card",
+   standalone: true,
+   template: `
+     @let call = toolCall();
+     @if (call.status === "in-progress") {
+       <p>Loading incident…</p>
+     } @else {
+       <article>
+         <strong>{{ call.args.id }}</strong>
+         <span>{{ call.args.severity }}</span>
+       </article>
+     }
+   `,
+ })
+ export class IncidentCardComponent implements ToolRenderer<IncidentArgs> {
+   readonly toolCall = input.required<AngularToolCall<IncidentArgs>>();
+ }
+ ```
+ 
+ ```ts
+ registerComponent({
+   name: "show_incident",
+   description: "Show one incident from the incident table.",
+   parameters: z.object({
+     id: z.string().describe("The incident id, such as INC-4711"),
+     severity: z.string().describe("One of sev1, sev2, sev3"),
+   }),
+   component: IncidentCardComponent,
+ });
+ ```
+ 
+ There is no `handler`, and nothing changes in your agent. The tool is declared by
+ the frontend and forwarded over AG-UI, so this works the same behind a Python
+ agent as a TypeScript one.
+ 
+ <Callout type="warn" title="A well-formed component is not a correct one">
+   The model fills these props from what it knows. A card rendered over records
+   your application does not hold looks the same in the browser, in a screenshot,
+   and in a video as a correct one. Share the page's data with the agent using
+   [`CopilotKitAgentContext`](/reference/angular/directives/CopilotKitAgentContext),
+   then read the rendered fields against the records you hold.
+ </Callout>
  
  | Path | Best fit | Angular setup |
  | --- | --- | --- |
+ | Your components, display only | The agent should show a component and nothing else runs | `registerComponent` |
  | Your components | Known data shapes and application actions | `registerFrontendTool` or `registerRenderToolCall` with a component |
  ## Next steps
  
+ - [registerComponent API](/reference/angular/functions/registerComponent)
  - [registerFrontendTool API](/reference/angular/functions/registerFrontendTool)
```

