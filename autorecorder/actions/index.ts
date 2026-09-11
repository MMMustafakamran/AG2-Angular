/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ADAPT THIS DIRECTORY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * What the recorder *does* on each demo page once it is open.
 *
 * The registry lives here rather than in `core/` on purpose: adding or removing
 * a page must never mean editing frozen code. A page with no entry falls back
 * to `runStandardAction` — type the prompt, submit, wait for the reply — which
 * is right for most pages. Write a handler only when a page needs more than
 * that: switching tabs, clicking an approval button, opening a panel.
 *
 * Handlers should build on the helpers in `core/actions.ts`:
 *
 *   sendPrompt(page, prompt, opts)          types and submits, returns the
 *                                           assistant-message count from before
 *                                           submitting
 *   waitForAgentResponseCompletion(...)     waits for the reply to finish, and
 *                                           throws if none ever arrives
 *   promptsFor(config)                      the page's prompts[] , or [prompt]
 *
 * Pass that returned count into waitForAgentResponseCompletion on multi-turn
 * pages, or the previous turn's reply is mistaken for this one's.
 *
 * ── Every page with a finding writes it down ───────────────────────────────
 * project-context.md: broken pages keep their broken implementation, because
 * "the clip exists to show the defect". But a clip of a feature not working is
 * indistinguishable from a clip of a recorder that mis-clicked, so eight of
 * these handlers end by driving the defect deliberately, resting the cursor on
 * the evidence, and typing the finding into a Notepad window over the top of
 * it — see `finding-note.ts` for the house format and why it is shared.
 *
 * Which is why `quickstart` and `memory` have handlers even though both pass
 * on the standard one. Quickstart's defect is in the doc page rather than the
 * demo, and memory's finding is that there is NO defect — that the guide's
 * isAvailable() gate did its job. Both need saying; neither can be inferred
 * from watching a green clip.
 */

import { type ActionContext, type PageActionHandler, type PageRecordConfig } from '../core/types';
import { runStandardAction } from '../core/actions';
import { type Page } from 'playwright';

import { waitForPageReady } from './page-ready';

import { runChatUiAction } from './chat-ui.action';
import { runHeadlessAction } from './headless.action';
import { runInspectorAction } from './inspector.action';
import { runQuickstartAction } from './quickstart.action';
import { runSharedStateAction } from './shared-state.action';
import { runThreadsAction } from './threads.action';
import { runToolsAction } from './tools.action';
import { runVoiceAction } from './voice.action';

/** Keys are page ids from `config/pages.config.ts`. Doctor flags any orphans. */
export const ACTION_MAP: Record<string, PageActionHandler> = {
  // Quickstart runs the standard turn and then writes a note: the chat works,
  // and the doc page it came from never shows the backend it talks to.
  quickstart: runQuickstartAction,
  'chat-ui': runChatUiAction,
  'frontend-tools-generative-ui': runToolsAction,
  'voice-multimodal': runVoiceAction,
  'shared-state': runSharedStateAction,
  threads: runThreadsAction,
  headless: runHeadlessAction,
  // The Inspector page's own subject is the panel, so the clip has to open
  // it. Falling through to runStandardAction would record a chat and
  // nothing else.
  inspector: runInspectorAction,
};

export async function executePageAction(
  page: Page,
  config: PageRecordConfig,
  rootPath: string,
  ctx: ActionContext,
): Promise<void> {
  // One gate for every page, including the ones that fall through to
  // runStandardAction. The engine waits for the route to respond and for
  // `chatReady` to be visible, but a dev server compiles client chunks lazily,
  // so markup can be on screen before anything is wired to it -- and a prompt
  // typed into an unhydrated input goes nowhere. Handlers that remount a chat
  // mid-run (tab switches) call waitForDomSettled again themselves.
  await waitForPageReady(page, { label: config.id });

  const handler = ACTION_MAP[config.id] ?? runStandardAction;
  await handler(page, config, rootPath, ctx);
}
