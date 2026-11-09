# Findings — AG2-Angular (AG2 Python agent + CopilotKit Angular)
Open doc defects only. A finding is proposed first and added only after the owner approves it (QA-RULES section 6; this set approved by the owner 2026-11-09). Numbers are stable IDs (code cites `FINDINGS.md #N`), so gaps are removed findings.
Stack: `@copilotkit/angular` 0.6.0 (npm latest; declared ^0.6.0), `@copilotkit/runtime` 1.85.0 (declared ^1.85.0), `@ag-ui/client` 1.0.4 (npm latest; declared ^1.0.4, not in the doc's install step), `@angular/core` 22.1.4, `@angular/cdk` 22.2.6, `zod` 4.5.4, `express` 5.2.1, `tsx` 4.23.13; agent: `ag2[ag-ui,openai]` 1.3.0 (ag-ui-protocol 1.0.0) + FastAPI 0.162.2 on Python 3.13.15 (uv); Node 26.7.0, npm 11, Windows 11 Pro. Docs: https://docs.copilotkit.ai/angular/ag2 (snapshot 2026-11-09)

## Dev blockers (seen with `ng serve` and normal use of the page)

### [Quickstart](https://docs.copilotkit.ai/angular/ag2/quickstart)
**#1 The AG2 Angular quickstart never shows an AG2 backend or a runtime server.**
- **Doc:** the "Connect the selected agent backend" step renders only a callout ("Configure Copilot Runtime to register this backend as the `default` agent at `/api/copilotkit`. Continue with the selected backend's Copilot Runtime guide …"); the `.md` export has `<!-- setup skipped: agent-setup is not bundled for ag2 -->` in its place. The linked Copilot Runtime page shows only a Next.js `route.ts` with `agents: { // your agents go here }`. "Run the backend, runtime, and Angular app" says "Start the selected agent backend and Copilot Runtime with the commands from its runtime guide", and no page gives those commands.
- **Result:** following the page gives an Angular chat pointed at `http://localhost:8200/api/copilotkit` with nothing behind it. The AG2 agent (`ag2.Agent` + `AGUIStream` mounted on FastAPI), the Node runtime server (`CopilotRuntime` + `createCopilotNodeListener`) and the `HttpAgent` binding (from `@ag-ui/client`, not installed by the page) all have to be guessed.
- **Confirmed by harness:** `backend/main.py` (written from the AG2 React quickstart / ag2-samples) and `frontend/server.ts` make the chat work ("Yes — I'm connected. Quick fun fact: kites were invented in ancient China…"). `POST /agent` without the trailing slash answers `307` and the run dies, so the URL must be `http://localhost:8241/agent/`.

### [A2UI schemas, styling, and recovery](https://docs.copilotkit.ai/angular/ag2/guides/a2ui)
**#2 The catalog the page requires is never defined.**
- **Doc:** "A catalog is required: without one, A2UI stays off even when the runtime enables it", then `provideCopilotKit({ runtimeUrl: "/api/copilotkit", a2ui: { catalog: productCatalog, … } })`; `fixedDefinitions` uses `dynamicString` and `satisfies A2UICatalogDefinitions`; the web-components snippet uses `createAngularCatalog`, `ChildListSchema`, `AcmeBadge`, `PanelComponent`; `beautifulCatalog`, `declarativeCatalog`, `fixedCatalog` are referenced, and the Airport/Arrow/AirlineBadge/PriceTag components are never shown.
- **Error:** `error TS2304: Cannot find name 'productCatalog'.` (also `'dynamicString'`, `'A2UICatalogDefinitions'`, `'createAngularCatalog'`, `'AcmeBadge'`, `'PanelComponent'`, `'ChildListSchema'`; `ng serve` type-checks, so the app doesn't build). Without the catalog: `[CopilotKit] The runtime enables A2UI, but no a2ui.catalog is configured, so A2UI stays off.` and nothing renders.

### [Voice and multimodal input](https://docs.copilotkit.ai/angular/ag2/guides/voice-multimodal)
**#3 Voice can't be set up: the transcription backend is never shown.**
- **Doc:** "Follow the [Voice backend setup](/angular/ag2/guides/voice-multimodal#backend) to add a dedicated Runtime route and transcription service."
- **Result:** the link points to the same page, and there's no `#backend` anchor on it. No route or `transcriptionService` code is shown, so `/info` reports `"audioFileTranscriptionEnabled":false` and the chat has no mic button. Attachments work ("The chart is titled "Quarterly revenue." Q4 comes to 300.").

### [Shared state and agent context](https://docs.copilotkit.ai/angular/ag2/guides/shared-state)
**#4 The state the app writes never reaches an AG2 agent.**
- **Doc:** "Agent and application both read and write the value | `injectAgentStore` and `agent.setState`", with `WorkspaceComponent.setPriority()` calling `agent.setState({ ...current, priority })`.
- **Result:** after "Mark high priority" the workspace shows `Priority: high`, but asked "What is the priority set to right now?" the agent answers "I'm not sure which "priority" you mean" / "I don't have access to any current priority setting". Every try (CI runs and 3 local runs). A direct AG-UI request to the AG2 endpoint with `state: {"priority": "high"}` gets the same, and the run's `STATE_SNAPSHOT` is only the agent's own variables (`{"language":"english"}`): AG2's `AGUIStream` doesn't pass the app's state to the agent. The page doesn't say this. (Agent context from `connectAgentContext` is inconsistent: the CI runs answered "You're currently set to Europe/London", local runs and direct requests did not.)

### [Sub-agents](https://docs.copilotkit.ai/angular/ag2/multi-agent/subagents)
**#5 The sub-agents code can't be run: it imports modules the page never shows, and the frontend code is React.**
- **Doc:** "Setting up sub-agents" has no setup steps (`.md`: `<!-- setup skipped: subagents-setup is not bundled for ag2 -->`). The page's Code tab (`subagents.py`, the complete file with `supervisor = Agent(...)` and `subagents_app.mount("", stream.build_asgi())`) and the two snippets below it all do `from ._loop_cap import loop_cap` and `from ._state import publish_state`; neither module is shown anywhere. The Code tab's frontend files are React (`page.tsx`, `delegation-log.tsx`, `route.ts`) on the Angular page; the Angular snippet calls `readDelegations(...)` and `subAgentRendererConfig(name)`, which are never defined. The snippet's Python block is printed twice.
- **Error:** `ModuleNotFoundError: No module named 'src.agents._loop_cap'` (Code-tab file saved as `src/agents/subagents.py`, verbatim). Nothing can be served, and there is no Angular code for the delegation log.

### [Authentication](https://docs.copilotkit.ai/angular/ag2/auth)
**#10 The authentication logic itself is never shown.**
- **Doc:** `headers: { Authorization: `Bearer ${readSessionToken()}` }` in `provideCopilotKit`, `copilotKit.updateRuntime({ headers: sessionToken ? … : {} })`, and in `server.ts` `const handler = createCopilotExpressHandler({ … onRequest: … const session = token ? await verifySession(token) : null; … })`.
- **Result:** `readSessionToken`, `sessionToken` and `verifySession` are never defined, the snippets have no imports, and the Express app the handler belongs to isn't shown, so the session handling and the token check have to be invented before the page does anything.
- **Confirmed by harness:** with a made-up token check (`frontend/auth-runtime.ts`, `verifySession` accepts the Showcase's `demo-token-123`) and a sign-in button that sets that token (`auth-chat.component.ts`), the doc's `onRequest` hook works: signed out the runtime answers `401 Unauthorized` (`Runtime info request failed with status 401`) and the chat gets no reply; signed in it replies.

### [Native generative UI](https://docs.copilotkit.ai/angular/ag2/guides/generative-ui-components) (in-content: linked from Frontend tools and generative UI, and Using the Angular docs)
**#6 The package entry point the page uses doesn't exist.**
- **Doc:** `import { provideGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui";` (also `createGenerativeUI`, `connectGenerativeUIState`, `@copilotkit/angular/generative-ui/chart|map|icons`).
- **Error:** `error TS2307: Cannot find module '@copilotkit/angular/generative-ui' or its corresponding type declarations.` `@copilotkit/angular` 0.6.0 (npm latest) exports only `.`, `./a2ui`, `./mcp-apps`, `./styles.css`. `shop.component.ts` also imports `./cart.store`, which is never shown.

## Minor notes
- #7 Frontend tools: `WeatherCardComponent` reads `call.args.city`, but no page shows the AG2 `getWeather` tool it renders. With the harness tool (`location`), the card's heading is empty (`<strong></strong>`) and the result shows.
- #8 Human-in-the-loop: the interrupt half (`store().interruptController`, `injectInterrupt`) can't fire on AG2 (its AG-UI bridge emits no interrupt events); the page doesn't say so. The `registerHumanInTheLoop` half works.
- #9 WebMCP: `searchOrders(status)` is never defined (`error TS2304: Cannot find name 'searchOrders'.`, so `ng serve` won't build until a helper is added). With a helper, the tool registers on `document.modelContext` (Chromium with `WebMCPTesting`).
- #11 Quickstart: the install step doesn't add `@ag-ui/client` (needed for `HttpAgent` in the runtime).
- #12 Threads, memory, attachments, headless: the thread list and memories stay empty without Intelligence (`threadEndpoints.list:false`); chat, headless UI and attachments work.
- #13 Inspector: "**[Inspector](/angular/ag2/inspector)** is the page to read for what the panes show" links to the page itself.
