/**
 * Shared state — the agent is given neither half of what this page shares.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 *
 * The guide's table has two rows, and this demo mounts both against one chat:
 *
 *   - read/write state, via `injectAgentStore` + `agent.setState`
 *     (WorkspaceComponent — the priority the buttons set)
 *   - read-only context, via `connectAgentContext`
 *     (AccountContextComponent — userName "Ada", and the timezone the
 *     "Use London time" button moves to Europe/London)
 *
 * Neither reaches the model, and the clip shows that by asking about each in
 * turn after the browser has visibly changed it:
 *
 *   1. click "Mark high priority". The panel updates to `high` — the write
 *      reached the store, so the browser half is seen working. Ask the agent
 *      what the priority is. It does not know.
 *   2. click "Use London time". Ask the agent for the name and timezone the
 *      account context is publishing. It does not know those either.
 *
 * Both turns are asked in plain language and both are answered by an agent with
 * no visibility of values the page believes it is sharing. That is the finding:
 * not a wrong answer and not an error — nothing arrives at all.
 *
 * Do not "fix" this by asserting on the answer, or by seeding either value from
 * the backend so the turns pass. A green turn here would mean the recorder was
 * measuring something other than what the page claims.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { dwellOn } from './finding-note';
import { closeNotepadNote, openNotepadWindow, typeInNotepad } from './notepad';

/** Clicks one of the workspace's controls, human-paced, and reports it. */
async function clickDemoButton(
  page: Page,
  selector: string,
  label: string,
): Promise<void> {
  const box = await page
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);

  if (!box) {
    console.warn(`   ⚠️ "${label}" button not found.`);
    return;
  }

  console.log(`   🔄 Clicking "${label}"...`);
  await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
  await sleep(400);
  await humanClick(page);
  // Rest afterwards: the browser side of the round trip DOES work, and has to
  // be seen working before the agent is asked about it.
  await sleep(1400);
}

/** What the workspace panel is currently showing, for the log and the note. */
async function panelPriority(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const text = document.querySelector('app-workspace')?.textContent ?? '';
      return (text.match(/Priority:\s*(\w+)/i)?.[1] ?? '').trim();
    })
    .catch(() => '');
}

export const runSharedStateAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const [
    priorityPrompt = 'what is priority set as?',
    contextPrompt = 'what is my name and what timezone am I in?',
  ] = promptsFor(config);
  const wait = config.waitAfterPromptMs ?? 4000;

  // ── Turn 1: shared state (agent.setState) ────────────────────────────────
  await clickDemoButton(
    page,
    'app-workspace button:has-text("Mark high priority")',
    'Mark high priority',
  );

  // Rest on the panel first. `Priority: high` is on screen, so when the agent
  // says it does not know, the viewer has already seen that the value exists.
  const afterHigh = await panelPriority(page);
  console.log(`   📋 Panel now reads: Priority: ${afterHigh || '(unreadable)'}`);
  await dwellOn(page, 'app-workspace', 2000);

  console.log(`   💬 Turn 1 — the shared state: ${priorityPrompt}`);
  const count1 = await sendPrompt(page, priorityPrompt);
  await waitForAgentResponseCompletion(page, wait, count1);
  await sleep(1400);

  // ── Turn 2: read-only context (connectAgentContext) ──────────────────────
  //
  // A different API on a different row of the guide's table, so turn 1 cannot
  // be read as one broken function. The click moves the timezone signal, which
  // re-registers the context — the accessor form exists precisely so it does.
  await clickDemoButton(
    page,
    'app-account-context button:has-text("Use London time")',
    'Use London time',
  );
  await dwellOn(page, 'app-account-context', 1600);

  console.log(`   💬 Turn 2 — the read-only context: ${contextPrompt}`);
  const count2 = await sendPrompt(page, contextPrompt);
  await waitForAgentResponseCompletion(page, wait, count2);
  await sleep(1400);

  // Back to the panel, so the last thing on screen before the note is the
  // value the agent just failed to know.
  await dwellOn(page, 'app-workspace', 2000);

  console.log(`   🧾 Writing the finding...`);
  await openNotepadWindow(page, 'shared-state-finding.txt', {
    right: '32px',
    top: '95px',
    width: '700px',
    height: '420px',
  });
  await typeInNotepad(
    page,
    [
      'neither value on this page reaches the agent.',
      '',
      `the panel says priority is ${afterHigh || 'high'} and the account context is`,
      'publishing Ada / Europe/London. asked about both, the agent',
      'knows neither - no error, nothing, it just never sees them.',
      '',
      'ag2/ag_ui/stream.py merges the incoming state UNDER the agent',
      "variables, so setState is discarded, and connectAgentContext",
      'never lands either. the ui updates, so it all looks fine',
      'until you ask.',
    ],
    1560,
    260,
  );
  await sleep(7000);
  await closeNotepadNote(page);
  await sleep(1200);
};
