/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ADAPT THIS FILE — 3 of 3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One entry per doc page, in the order the doc nav lists them.
 *
 * Entries are deliberately short. `docUrl`, `demoUrl` and the output filename
 * are derived from `project.config.ts` plus the fields below, so no entry can
 * point at the wrong framework's docs and filenames stay in nav order without
 * anyone numbering them by hand.
 *
 * Adapting means: delete the pages this framework does not document, add the
 * ones it does, and fix the line ranges. `npm run doctor` then tells you which
 * ranges no longer point at real code.
 *
 * ── Scope, for this repo ───────────────────────────────────────────────────
 * `route` + `demoSuffix` is the only demo URL a page can have, and the doctor
 * errors on any that is not 200. This app's nav lists 12 doc routes; the
 * Introduction landing page (`/`) is the one without a `/demo` of its own —
 * `demoPath()` in nav-config.ts returns undefined for it — so it is deliberately
 * absent below rather than registered and broken. `/status` is app furniture
 * rather than a doc page, and is likewise absent.
 *
 * Everything here mirrors `frontend/src/app/lib/nav-config.ts`, the app's single
 * source of truth for route -> doc-page mapping. `docPath` is that file's
 * `docPath` minus its leading `/angular/ag2`. Four routes (threads,
 * memory, attachments, headless) repeat one `docPath` because the Angular docs
 * cover all four topics on a single page — that is the doc's shape, not a
 * copy/paste slip.
 *
 * ── The line ranges ────────────────────────────────────────────────────────
 * `startLine`/`endLine` are what the simulated IDE highlights. They are
 * hardcoded, so they drift the moment someone edits a demo component. Doctor
 * guards ranges in files carrying `[!code highlight]` or `#region` markers.
 * This frontend uses neither: it brackets each documented snippet with
 * `// <topic> : <snippet name> start|end` line comments, which
 * frontend/scripts/generate-sources.ts reads. Every range below was set from
 * those brackets by hand, so `npm run doctor` proves a range is in-bounds, not
 * that it still frames the snippet the page is about — re-read them after
 * editing a feature component. Teaching the doctor this repo's marker syntax
 * would restore the guard, but that is a `core/` change and therefore a finding
 * to report, not something to do here.
 */

import { type PageDefinition, definePages } from '../core/types';

const RESERVED_PREFIX = 'reserved:';

/**
 * A slot in the Angular guide list that this repo has no demo for.
 *
 * The clip index is `definePages`' array position, so without these the
 * numbering closes up over a missing page: Shared State recorded as `06` here
 * and `07` in Agno-angular and Mastra-angular, which document the same guides
 * in the same order. The clips land in one folder, so two files with the same
 * number showing different guides is exactly the confusion the numbering is
 * there to prevent.
 *
 * Reserving the slot keeps the number attached to the guide rather than to
 * whatever this repo happens to record. A reserved entry exists only to occupy
 * an index — it is filtered out below, before `definePages`' result is
 * exported, so no doctor check, CLI flag, shard split or recording ever sees
 * one. Its fields are placeholders for that reason.
 *
 * When the demo does land, replace the `reserve(...)` call with the real entry
 * in place and the number it has always been reserved for is the one it gets.
 */
const reserve = (guide: string): PageDefinition => ({
  id: `${RESERVED_PREFIX}${guide}`,
  name: `(reserved) ${guide}`,
  videoName: 'Reserved',
  docPath: '',
  route: '',
  ideFile: '',
  startLine: 1,
  endLine: 1,
  prompt: '',
});

export const PAGES = definePages([
  {
    id: 'quickstart',
    name: 'Quickstart',
    videoName: 'Quickstart',
    docPath: 'quickstart',
    route: 'quickstart',
    // Dependency manifest first, always: a demo means nothing without the
    // versions it ran against, and @copilotkit/angular is a 0.x package that
    // moves faster than its docs do. The range is the whole `dependencies`
    // block, so @copilotkit/angular, @copilotkit/runtime and @ag-ui/client are
    // legible in one frame.
    // Leads with the versions, not the manifest. package.json declares
    // RANGES, so this clip used to show a floor while the run it
    // documented had installed something newer. VERSIONS.md is generated
    // after install (ci/write-versions.mjs) and names what resolved.
    // package.json stays as the first tab: the range is still what a
    // reader would write in their own project.
    ideFile: 'frontend/VERSIONS.md',
    startLine: 6,
    endLine: 20,
    // Then the path itself, in the order a request travels it: the chat
    // component, the Node process hosting the runtime (Angular has no server
    // route to host it in), and the AG2 endpoint it proxies to.
    extraTabs: [
      {
        filePath: 'frontend/package.json',
        startLine: 19,
        endLine: 36,
      },
      {
        filePath: 'frontend/src/app/features/quickstart/quickstart-chat.ts',
        startLine: 1,
        endLine: 15,
      },
      // `quickstart : copilot runtime start|end` — the HttpAgent bindings.
      { filePath: 'frontend/server.ts', startLine: 29, endLine: 44 },
      // `quickstart : mount the ag-ui stream start|end`, with the FastAPI app
      // it is mounted on.
      { filePath: 'backend/main.py', startLine: 159, endLine: 178 },
    ],
    prompt: 'Hey, are you connected? Tell me a quick fun fact about kites.',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'chat-ui',
    name: 'Guides - Chat UI and customization',
    videoName: 'ChatUi',
    docPath: 'guides/chat-ui',
    route: 'chat-ui',
    ideFile: 'frontend/src/app/features/chat-ui/chat-ui-demo.component.ts',
    startLine: 28,
    endLine: 56,
    // The replaced assistant message is the guide's actual lesson; the wrapper
    // above only chooses which surface is mounted.
    // `chat ui : replace an assistant message start|end`.
    extraTabs: [
      {
        filePath:
          'frontend/src/app/features/chat-ui/custom-assistant-message.component.ts',
        startLine: 15,
        endLine: 27,
      },
    ],
    // Four surfaces, driven in order by the handler: inline, custom assistant
    // message, popup, sidebar. Only the first two take a prompt.
    prompt: 'In two sentences, what does CopilotKit do?',
    prompts: [
      'In two sentences, what does CopilotKit do?',
      'Nice layout. What is different about how you are rendered here?',
    ],
    waitAfterPromptMs: 4000,
  },
  {
    id: 'frontend-tools-generative-ui',
    name: 'Guides - Frontend tools and generative UI',
    videoName: 'FrontendToolsGenerativeUi',
    docPath: 'guides/frontend-tools-generative-ui',
    route: 'frontend-tools-generative-ui',
    // The constructor is the lesson: `registerRenderToolCall` for the
    // server-side tool, `registerFrontendTool` for the browser-side one, and
    // `registerComponent` — the guide's new first section — now mounted and
    // running, since the frontend moved to @copilotkit/angular 0.5.1.
    // Class declaration through the closing brace: lines 57-86 of an 87-line
    // file, re-counted after the third registration replaced the commented one.
    ideFile: 'frontend/src/app/features/tools/tools-chat.component.ts',
    startLine: 57,
    endLine: 86,
    extraTabs: [
      {
        filePath: 'frontend/src/app/features/tools/weather-card.component.ts',
        startLine: 12,
        endLine: 29,
      },
      // The other half of the pair: getWeather runs in the AG2 process and
      // the browser only renders the call. Note @tool(name=...): AG2 publishes
      // the tool under that name, which is what the renderer binds to.
      // `frontend tools : server tool getWeather start|end`.
      { filePath: 'backend/main.py', startLine: 47, endLine: 57 },
      // The guide's "Let the agent display one of your components" renderer,
      // verbatim. Its `@if (call.status === "in-progress")` guard is the second
      // finding on camera: the real status is "executing", so the guard never
      // fires and the @else branch paints an empty card until the args land.
      // `@Component` through the class brace, matching the weather-card tab.
      {
        filePath: 'frontend/src/app/features/tools/incident-card.component.ts',
        startLine: 12,
        endLine: 29,
      },
    ],
    // Three turns: a server-side tool the browser only renders, a frontend tool
    // whose result is the page itself repainting, and the new display-only
    // registration — which draws the right card and then makes the agent
    // apologise for it.
    prompt: 'Check the weather in Tokyo for me.',
    prompts: [
      'Check the weather in Tokyo for me.',
      'Could you change the background to violet?',
      'Pull up incident INC-4711 for me. It is a sev1.',
    ],
    waitAfterPromptMs: 4000,
  },

  {
    id: 'a2ui',
    name: 'Guides - A2UI schemas, styling, and recovery',
    videoName: 'A2ui',
    docPath: 'guides/a2ui',
    route: 'a2ui',
    // The catalog CSS the guide prescribes, in the global stylesheet. It is the
    // only A2UI code this repo has, because the guide's catalog snippet cannot
    // be completed — which is the finding.
    ideFile: 'frontend/src/app/features/a2ui/a2ui-chat.component.ts',
    startLine: 1,
    endLine: 25,
    extraTabs: [
      // `a2ui : recover incomplete streams start|end`, plus the provider that
      // reports a2uiEnabled: true while rendering nothing.
      {
        filePath: 'frontend/src/app/app.config.ts',
        startLine: 44,
        endLine: 68,
      },
    ],
    // Asks for something only a catalog could render. The prose answer that
    // comes back instead IS the finding — see actions/a2ui.action.ts.
    prompt: 'Can you put together a flight booking card for London? I want a confirm button on it.',
    waitAfterPromptMs: 4000,
  },

  {
    id: 'voice-multimodal',
    name: 'Guides - Voice and multimodal input',
    videoName: 'VoiceMultimodal',
    docPath: 'guides/voice-multimodal',
    route: 'voice-multimodal',
    // `voice & multimodal : configure attachments start|end` plus the component
    // that binds it — the microphone control itself needs no option.
    ideFile: 'frontend/src/app/features/media/voice-chat.component.ts',
    startLine: 12,
    endLine: 31,
    // Both inputs the page teaches, in the order the guide walks them: attach
    // first, then press the microphone. The image goes through the composer and
    // IS read correctly; the microphone then records, and this runtime
    // configures no transcription service, so transcription fails by design —
    // which is what frontend/src/app/pages/voice-multimodal.ts already says.
    //
    // The prompt asks for two values that exist only inside the attached chart,
    // so a correct answer is proof the image reached the model — and proof the
    // failing microphone is one unconfigured service rather than a broken page.
    // A generic question could be answered without ever seeing the file.
    prompt:
      'Have a look at the chart I attached. What is it titled, and what does Q4 come to?',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'human-in-the-loop',
    name: 'Guides - Human-in-the-loop and interrupts',
    videoName: 'HumanInTheLoop',
    docPath: 'guides/human-in-the-loop',
    route: 'human-in-the-loop',
    // The registration is the lesson; the card is what the viewer clicks.
    ideFile: 'frontend/src/app/features/hitl/approval-tools.service.ts',
    startLine: 15,
    endLine: 30,
    extraTabs: [
      {
        filePath: 'frontend/src/app/features/hitl/approval-card.component.ts',
        startLine: 18,
        endLine: 41,
      },
    ],
    prompt: 'Please delete my account. Check with me before you actually do it.',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'shared-state',
    name: 'Guides - Shared state and agent context',
    videoName: 'SharedState',
    docPath: 'guides/shared-state',
    route: 'shared-state',
    ideFile: 'frontend/src/app/features/shared-state/workspace.component.ts',
    startLine: 21,
    endLine: 50,
    extraTabs: [
      {
        filePath:
          'frontend/src/app/features/shared-state/account-context.component.ts',
        startLine: 11,
        endLine: 33,
      },
      // The agent side of the same feature. AG2 has no state schema: shared
      // state is the agent's context variables, which the AG-UI bridge
      // publishes as STATE_SNAPSHOT, and a tool moves it by writing Context.
      // `shared state : agent variables start|end` and
      // `shared state : update language tool start|end`.
      { filePath: 'backend/main.py', startLine: 37, endLine: 44 },
      { filePath: 'backend/main.py', startLine: 60, endLine: 79 },
    ],
    // Three turns, read in order by actions/shared-state.action.ts, each asked
    // after the browser has visibly changed the value: priority once `high` is
    // written, priority again once `low` is, then the read-only context the
    // timezone button moves. Asking the same question across two different
    // written values is what separates a real read of agent state from a word
    // echoed out of the question. The finding is not a wrong answer — it is an
    // agent with no visibility of either value the page is actively displaying.
    prompt: 'What is the priority set to right now?',
    prompts: [
      'What is the priority set to right now?',
      'And now? What is the priority?',
      'Which timezone am I on?',
    ],
    waitAfterPromptMs: 4000,
  },
  {
    id: 'threads',
    name: 'Threads',
    videoName: 'Threads',
    docPath: 'guides/threads-memory-attachments-headless',
    route: 'threads',
    ideFile: 'frontend/src/app/features/threads/thread-list.component.ts',
    startLine: 10,
    endLine: 44,
    extraTabs: [
      // The drop-in half of the guide: CopilotThreadsDrawer beside a chat,
      // under one provideCopilotChatConfiguration.
      {
        filePath: 'frontend/src/app/features/threads/conversations.component.ts',
        startLine: 8,
        endLine: 25,
      },
      {
        filePath: 'frontend/src/app/features/threads/threads-demo.component.ts',
        startLine: 10,
        endLine: 34,
      },
    ],
    // Thread endpoints are licensed. Unlicensed, the hand-built list stays empty
    // and the drawer renders its locked state — which is the expected result,
    // and what this recording documents. The chat beside it answers normally.
    prompt: 'In one line, what are threads for?',
    waitAfterPromptMs: 4000,
  },

  {
    id: 'memory',
    name: 'Memory',
    videoName: 'Memory',
    docPath: 'guides/threads-memory-attachments-headless',
    route: 'memory',
    // `memory : list memories start|end` — injectMemories behind the
    // isAvailable() gate the guide requires.
    ideFile: 'frontend/src/app/features/memory/memory-list.component.ts',
    startLine: 10,
    endLine: 44,
    // Recorded even though the feature is absent, because the absence is
    // handled correctly and that is worth showing: the gate the guide insists
    // on is what keeps this page from breaking. See actions/memory.action.ts.
    prompt: 'Do you remember anything about me from earlier chats?',
    waitAfterPromptMs: 4000,
  },

  {
    id: 'attachments',
    name: 'Attachments',
    videoName: 'Attachments',
    docPath: 'guides/threads-memory-attachments-headless',
    route: 'attachments',
    // `attachments : enable attachments` and the config block inside it.
    ideFile: 'frontend/src/app/features/attachments/media-chat.component.ts',
    startLine: 11,
    endLine: 27,
    // Asks for two values that exist only inside the attached image, so a
    // correct answer is proof the file reached the model. A generic "what types
    // of attachments are supported?" could be answered from the system prompt
    // alone, which is how a broken upload comes to look fine on video.
    prompt:
      'I attached a chart. What is its title, and what is the Q4 number?',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'headless',
    name: 'Headless UI',
    videoName: 'HeadlessUi',
    docPath: 'guides/threads-memory-attachments-headless',
    route: 'headless',
    ideFile: 'frontend/src/app/features/headless/headless-chat.component.ts',
    startLine: 12,
    endLine: 65,
    prompt: 'Tell me a short joke about Angular developers.',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'inspector',
    name: 'Inspector',
    videoName: 'Inspector',
    docPath: 'inspector',
    route: 'inspector',
    // Appended rather than placed in nav order, where the sidebar puts it just
    // after Quickstart. The clip index is the position in this array, so
    // inserting it there would renumber every later clip in this repo and
    // desync the numbering from the sibling repos that document the same guides
    // in the same order.
    //
    // The chat is the whole demo component, and its emptiness is the evidence:
    // it mounts no Inspector, yet the launcher is there.
    ideFile: 'frontend/src/app/features/inspector/inspector-chat.component.ts',
    startLine: 19,
    endLine: 30,
    extraTabs: [
      // The mount check the clip reads on screen -- it counts the elements in
      // the document and names which of the guide's three cases it found.
      {
        filePath:
          'frontend/src/app/features/inspector/inspector-probe.component.ts',
        startLine: 143,
        endLine: 151,
      },
      // enableInspector is the only switch the page documents, and this
      // provider block deliberately does not set it -- the default-on
      // development behaviour is the state the guide describes, and the state
      // the quickstart's confirm-setup step assumes.
      {
        filePath: 'frontend/src/app/app.config.ts',
        startLine: 50,
        endLine: 69,
      },
    ],
    // The quickstart's Inspector step is not satisfied by a static panel: it
    // asks the reader to send a message and watch AG-UI events move, so the
    // run has to happen before the panel is opened.
    prompt: 'Quick check: what is 17 times 23?',
    waitAfterPromptMs: 4000,
  },
]).filter((page) => !page.id.startsWith(RESERVED_PREFIX));
