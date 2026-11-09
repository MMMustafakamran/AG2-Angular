/**
 * Page actions for AG2 + Angular. Each drives the feature its doc page teaches and checks the
 * effect the page promises; a missing effect calls ctx.fail, so a broken page records as a
 * failing clip (with the failure terminal at the end) instead of a quiet pass.
 *
 * ❌/⚠️ pages (assignment.json) end with the level-1 tail: back to the doc, drag-select each
 * faulty snippet (FINDING_EVIDENCE), then the note typed into Notepad (humanizeNote, via
 * showFinding). ✅ pages are plain working takes (AUTORECORDER.md sections 2-3).
 */
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Page } from 'playwright';

import { type ActionContext, type PageActionHandler } from '../core/types';
import { runStandardAction, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { mark } from '../core/timeline';
import { attachImage } from './attach-image';
import { type DocEvidence, showFinding } from './doc-evidence';
import { glideClick, glideTo } from './glide-click';

// ---------------------------------------------------------------------------------------------
// Findings shown at the end of ❌/⚠️ clips. `text` is matched on the rendered doc page.
// ---------------------------------------------------------------------------------------------

export const FINDING_EVIDENCE: Record<string, DocEvidence[]> = {
  quickstart: [
    { text: 'Configure Copilot Runtime to register this backend', caption: 'The backend step is only this callout: no AG2 code (FINDINGS.md #1)' },
    { text: 'Start the selected agent backend and Copilot Runtime', caption: 'No page gives these commands for AG2 + Angular' },
  ],
  'generative-ui-components': [
    { text: 'provideGenerativeUI({ ui: standardUI }),', caption: 'provideGenerativeUI is not in @copilotkit/angular 0.6.0 (FINDINGS.md #6)' },
    { text: 'from "@copilotkit/angular/generative-ui";', caption: 'TS2307: the entry point does not exist' },
  ],
  a2ui: [
    { text: 'catalog: productCatalog,', caption: 'productCatalog is never defined (FINDINGS.md #2)' },
    { text: 'Title: { props: z.object({ text: dynamicString }) },', caption: 'dynamicString is never defined' },
  ],
  'voice-multimodal': [
    { text: 'Follow the Voice backend setup to add a dedicated Runtime', caption: 'The link points to a #backend anchor that does not exist (FINDINGS.md #3)' },
  ],
  'shared-state': [
    { text: 'Agent and application both read and write the value', caption: 'AG2 drops the state the app writes (FINDINGS.md #4)' },
    { text: 'agent.setState({ ...current, priority });', caption: 'The write the agent never sees' },
  ],
  auth: [
    { text: 'Authorization: `Bearer ${readSessionToken()}`,', caption: 'readSessionToken is never defined (FINDINGS.md #10)' },
    { text: 'const session = token ? await verifySession(token) : null;', caption: 'verifySession is never defined; no imports, no server around the handler' },
  ],
  'multi-agent-subagents': [
    { text: 'from ._loop_cap import loop_cap', caption: '_loop_cap is never shown: ModuleNotFoundError (FINDINGS.md #5)', clickTab: 'Code' },
    { text: 'from ._state import publish_state', caption: '_state is never shown either', clickTab: 'Code' },
    { text: 'registerRenderToolCall(subAgentRendererConfig(name));', caption: 'subAgentRendererConfig / readDelegations are never defined' },
  ],
};

export const FINDING_NOTES: Record<string, string> = {
  quickstart: [
    'the backend step is just a callout, the md export says setup skipped, agent-setup is not bundled for ag2',
    'no ag2 agent, no runtime server.ts, and @ag-ui/client is not in the install step',
    'the copilot runtime page it links only has a next.js route with your agents go here',
    'so following the page the chat has nothing to talk to',
    'this chat only works bc i wrote backend/main.py with AGUIStream on fastapi',
    'and frontend/server.ts with an HttpAgent myself',
    'POST /agent without the trailing slash gives 307 and the run dies',
  ].join('\n'),
  'generative-ui-components': [
    'the page imports provideGenerativeUI and standardUI from @copilotkit/angular/generative-ui',
    'that entry point is not in @copilotkit/angular 0.6.0, the latest on npm',
    'typescript says cannot find module @copilotkit/angular/generative-ui',
    'ng serve type checks so the app does not build with this code',
    'without the provider the agent just wrote html code as text, no product card component',
    'shop.component.ts also imports ./cart.store which is never shown',
  ].join('\n'),
  a2ui: [
    'the page says a catalog is required, then uses catalog: productCatalog',
    'productCatalog, dynamicString, A2UICatalogDefinitions and createAngularCatalog are never defined',
    'typescript says cannot find name productCatalog so ng serve fails',
    'without a catalog the console says a2ui stays off',
    'so asking for a flight card renders nothing',
  ].join('\n'),
  'voice-multimodal': [
    'attachments work, the agent read the chart i attached',
    'but there is no mic button in the chat',
    'the page says follow the voice backend setup, that link goes to #backend on the same page',
    'there is no backend section, so the transcription route is never shown',
    '/info reports audioFileTranscriptionEnabled false so the mic is hidden',
  ].join('\n'),
  'shared-state': [
    'i set priority to high with mark high priority, thats agent.setState',
    'then asked the agent what the priority is and it says it doesnt see any priority',
    'so the state the app writes never reaches the ag2 agent, every time i tried',
    'the page says agent and application both read and write the value, not true on ag2',
  ].join('\n'),
  'multi-agent-subagents': [
    'the setup step is empty, the md export says setup skipped',
    'the code tab subagents.py imports ._loop_cap and ._state, neither is shown anywhere',
    'python fails with modulenotfound no module named src.agents._loop_cap',
    'the code tab frontend files are react, page.tsx and delegation-log.tsx, on the angular page',
    'readDelegations and subAgentRendererConfig are never defined',
    'so the chat answers from the plain agent and the delegation log stays empty',
  ].join('\n'),
  auth: [
    'the app config sends Bearer readSessionToken but readSessionToken is never defined',
    'the server hook calls verifySession, also never defined, and the snippets have no imports',
    'the express app around createCopilotExpressHandler is not shown either',
    'so the actual auth logic has to be invented to make this page run',
    'with my own token check, signed out the runtime answers 401 and the chat gets no reply',
    'signed in with a made up demo token it replies',
  ].join('\n'),
};

async function writeFinding(page: Page, id: string, config: Parameters<PageActionHandler>[1]): Promise<void> {
  await showFinding(page, config, FINDING_EVIDENCE[id], FINDING_NOTES[id]);
}

async function settle(page: Page, msgCount: number, ctx: ActionContext, quietMs = 3000): Promise<void> {
  try {
    await waitForAgentResponseCompletion(page, quietMs, msgCount);
  } catch (e) {
    ctx.warn(`Reply did not complete cleanly: ${String(e).slice(0, 160)}`);
  }
}

/**
 * Run a real command and append its output to a repo log (logs/<file>), so the failure terminal
 * at the end of the clip tails the real error. Never throws.
 */
function runToLog(root: string, file: string, cwd: string, cmd: string, args: string[]): Promise<void> {
  mkdirSync(join(root, 'logs'), { recursive: true });
  const log = join(root, 'logs', file);
  appendFileSync(log, `\n$ (cd ${cwd} && ${cmd} ${args.join(' ')})\n`);
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: join(root, cwd), timeout: 180000, shell: process.platform === 'win32' }, (_err, stdout, stderr) => {
      appendFileSync(log, `${stdout ?? ''}${stderr ?? ''}`);
      resolve();
    });
  });
}

const typecheck = (root: string, folder: string) =>
  runToLog(root, 'doc-typecheck.log', 'frontend', 'node', [
    'node_modules/typescript/bin/tsc',
    '-p',
    `doc-verbatim/${folder}/tsconfig.json`,
  ]);

// ---------------------------------------------------------------------------------------------
// ❌ / ⚠️ pages
// ---------------------------------------------------------------------------------------------

/** Quickstart: the chat answers, but only on the harness backend + runtime (FINDINGS.md #1). */
export const runQuickstartAction: PageActionHandler = async (page, config, root, ctx) => {
  try {
    await runStandardAction(page, config, root, ctx);
  } finally {
    await writeFinding(page, config.id, config);
  }
};

/** Native generative UI: ask for a product card; no surface renders; the verbatim code won't compile. */
export const runGenUiAction: PageActionHandler = async (page, config, root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const surface = page.locator('copilot-generative-ui-surface, copilot-generative-ui-surface-view, app-product-card');
  const rendered = await surface.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (!rendered) mark('error');
  await sleep(2000);
  await typecheck(root, 'generative-ui-components');
  await writeFinding(page, config.id, config);
  if (!rendered) ctx.fail("No generative UI rendered: the page's provideGenerativeUI comes from @copilotkit/angular/generative-ui, which doesn't exist (TS2307, FINDINGS.md #6).");
};

/** A2UI: ask for a flight card; A2UI stays off without the never-defined catalog. */
export const runA2uiAction: PageActionHandler = async (page, config, root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const surface = page.locator('copilot-a2ui-surface, a2ui-surface, [class*="a2ui-"]');
  const rendered = await surface.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (!rendered) mark('error');
  await sleep(2000);
  await typecheck(root, 'a2ui');
  await writeFinding(page, config.id, config);
  if (!rendered) ctx.fail('No A2UI surface rendered: "no a2ui.catalog is configured, so A2UI stays off"; the page\'s productCatalog is never defined (TS2304, FINDINGS.md #2).');
};

/** Voice and multimodal: attachments work; there is no mic (no transcription route shown). */
export const runVoiceAction: PageActionHandler = async (page, config, root, ctx) => {
  try {
    await attachImage(page, root);
    const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
    await settle(page, msgCount, ctx);
    const reply = (await page.locator('copilot-chat-assistant-message').last().innerText().catch(() => '')) || '';
    if (!/quarterly|revenue|q4/i.test(reply)) ctx.fail(`The agent did not read the attached chart: "${reply.slice(0, 160)}"`);
    const mic = page.locator('button[aria-label*="microphone" i], button[aria-label*="voice" i], button[aria-label*="record" i]');
    if ((await mic.count()) === 0) mark('error', 'no mic button in the composer');
    await glideTo(page, page.locator('copilot-chat-input, textarea').first(), 2500);
  } finally {
    await writeFinding(page, config.id, config);
  }
};

/** Shared state: the UI writes priority with agent.setState, then asks the agent what it is. */
export const runSharedStateAction: PageActionHandler = async (page, config, _root, ctx) => {
  const workspace = page.locator('app-workspace').first();
  await glideTo(page, workspace, 1500);
  await glideClick(page, page.getByRole('button', { name: 'Mark high priority' }).first());
  await sleep(2000);
  await glideTo(page, workspace, 1500);
  const msgCount = await sendPrompt(page, 'What is the priority set to right now?', { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = (await page.locator('copilot-chat-assistant-message').last().innerText().catch(() => '')) || '';
  const sawPriority = /\bhigh\b/i.test(reply);
  if (!sawPriority) mark('error');
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  await writeFinding(page, config.id, config);
  if (!sawPriority) {
    ctx.fail(`The agent never saw the priority the app wrote with agent.setState: "${reply.slice(0, 160)}" (FINDINGS.md #4).`);
  }
};

/** Authentication: signed out the hooked runtime answers 401 (no reply); signed in it replies. */
export const runAuthAction: PageActionHandler = async (page, config, _root, ctx) => {
  await sendPrompt(page, config.prompt, { timeoutMs: 15000, expectInputToEmpty: false }).catch(() => {});
  await sleep(9000);
  mark('error', 'signed out: runtime answers 401, no reply');
  await glideClick(page, page.getByRole('button', { name: 'Sign in' }).first());
  await sleep(1500);
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = (await page.locator('copilot-chat-assistant-message').last().innerText().catch(() => '')) || '';
  if (!reply.trim()) ctx.warn('No reply after signing in.');
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  await writeFinding(page, config.id, config);
};

/** Sub-agents: ask for research -> write -> critique; the delegation log stays empty; the doc's agent won't import. */
export const runSubagentsAction: PageActionHandler = async (page, config, root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const log = page.getByText('No delegations yet.').first();
  const empty = await log.isVisible().catch(() => false);
  await glideTo(page, log, 2500);
  if (empty) mark('error');
  await runToLog(root, 'subagents-import.log', 'backend', 'uv', ['run', 'python', '-c', 'import src.agents.subagents']);
  await writeFinding(page, config.id, config);
  if (empty) ctx.fail("No delegation ran: the page's subagents.py can't be imported (ModuleNotFoundError: No module named 'src.agents._loop_cap', FINDINGS.md #5).");
};

// ---------------------------------------------------------------------------------------------
// ✅ pages
// ---------------------------------------------------------------------------------------------

/** Frontend tools: change_background changes the page; show_incident renders the incident card. */
export const runFrontendToolsAction: PageActionHandler = async (page, config, _root, ctx) => {
  const host = page.locator('app-tools-chat > div').first();
  const before = await host.evaluate((el) => (el as HTMLElement).style.background).catch(() => '');
  let msgCount = await sendPrompt(page, 'Could you change the background to violet?', { timeoutMs: 15000 });
  const changed = await page
    .waitForFunction(
      (prev) => (document.querySelector('app-tools-chat > div') as HTMLElement | null)?.style.background !== prev,
      before,
      { timeout: 60000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!changed) ctx.fail('change_background never ran: the background did not change.');
  await settle(page, msgCount, ctx);
  await sleep(1500);
  msgCount = await sendPrompt(page, 'Pull up incident INC-4711 for me. It is a sev1.', { timeoutMs: 15000 });
  const card = page.locator('app-incident-card').last();
  const shown = await card.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false);
  if (!shown) ctx.fail('show_incident never rendered the incident card.');
  await settle(page, msgCount, ctx);
  if (shown) await glideTo(page, card, 2500);
};

/** HITL: the approval card appears, the user approves, the run resumes. */
export const runHitlAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const card = page.locator('app-approval-card').last();
  const shown = await card.waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
  if (!shown) {
    ctx.fail('The approval card never appeared: requestApproval was not called.');
    return;
  }
  await glideTo(page, card, 2000);
  await glideClick(page, card.getByRole('button', { name: 'Approve' }));
  await sleep(1500);
  await settle(page, msgCount, ctx);
  await sleep(2000);
};

/** Inspector: run one turn, open the launcher, walk the panes the quickstart names. */
export const runInspectorAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const inspector = page.locator('cpk-web-inspector');
  if ((await inspector.count()) === 0) {
    ctx.fail('No <cpk-web-inspector> on the page.');
    return;
  }
  await glideClick(page, inspector.locator('button').first());
  await sleep(2500);
  for (const pane of ['Agent', 'AG-UI Events', 'Rich Threads']) {
    const link = inspector.getByText(pane, { exact: true }).first();
    if (await link.isVisible().catch(() => false)) {
      await glideClick(page, link);
      await sleep(3000);
    } else {
      ctx.warn(`Inspector pane "${pane}" not found.`);
    }
  }
};
