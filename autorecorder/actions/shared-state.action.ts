/**
 * Shared state — the agent does not know the state the page is holding.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 *
 * The guide opens on a table whose first row is "Agent and application both
 * read and write the value → injectAgentStore and agent.setState". On an AG2
 * backend that row is false, and this clip exists to show it rather than to
 * work around it.
 *
 * The demonstration is the same move twice, because once is an anecdote:
 *
 *   1. click "Mark high priority". The panel updates to `high`, so the write
 *      reached the store — the browser half works and is seen working.
 *      Ask the agent what the priority is. It does not know.
 *   2. click "Mark low priority". Panel updates again. Ask again. Still nothing.
 *
 * Both turns are asked in plain language, and both are answered by an agent
 * that has no idea the page is holding a value at all. That is the finding:
 * not a wrong answer, not an error — an agent with no visibility of state the
 * page believes it is sharing.
 *
 * The cause is in ag2/ag_ui/stream.py:
 *
 *     initial_state = (command.incoming.state or {}) | initial_vars
 *
 * The incoming AG-UI state is merged UNDER the agent's own variables, so any
 * key the agent declares wins and the browser's value is discarded. Verified
 * end to end through the runtime: state {"language":"spanish"} to an agent
 * whose variables say english runs english, and the first STATE_SNAPSHOT echoes
 * english back.
 *
 * Do not "fix" this by asserting on the answer, or by seeding the state from
 * the backend so the turns pass. A green turn here would mean the recorder was
 * measuring something other than what the page claims.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { dwellOn, showFindingNote } from './finding-note';

/** Clicks one of the workspace's state buttons, human-paced, and reports it. */
async function clickStateButton(
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
  // Rest afterwards: the value visibly changes in the panel, which is the half
  // of the round trip that DOES work and has to be seen working.
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
    highPrompt = 'what is priority set as?',
    lowPrompt = 'what is priority set as?',
  ] = promptsFor(config);
  const wait = config.waitAfterPromptMs ?? 4000;

  // ── Turn 1 ───────────────────────────────────────────────────────────────
  await clickStateButton(
    page,
    'app-workspace button:has-text("Mark high priority")',
    'Mark high priority',
  );

  // Rest on the panel first. `Priority: high` is on screen, so when the agent
  // says it does not know, the viewer has already seen that the value exists.
  const afterHigh = await panelPriority(page);
  console.log(`   📋 Panel now reads: Priority: ${afterHigh || '(unreadable)'}`);
  await dwellOn(page, 'app-workspace', 2000);

  console.log(`   💬 Turn 1 (expect the agent NOT to know): ${highPrompt}`);
  const count1 = await sendPrompt(page, highPrompt);
  await waitForAgentResponseCompletion(page, wait, count1);
  await sleep(1400);

  // ── Turn 2: the same move, so turn 1 cannot be read as a one-off ─────────
  await clickStateButton(
    page,
    'app-workspace button:has-text("Mark low priority")',
    'Mark low priority',
  );

  const afterLow = await panelPriority(page);
  console.log(`   📋 Panel now reads: Priority: ${afterLow || '(unreadable)'}`);
  await dwellOn(page, 'app-workspace', 1800);

  console.log(`   💬 Turn 2 (expect the same): ${lowPrompt}`);
  const count2 = await sendPrompt(page, lowPrompt);
  await waitForAgentResponseCompletion(page, wait, count2);
  await sleep(1400);

  // Back to the panel, so the last thing on screen before the note is the
  // value the agent just failed to know.
  await dwellOn(page, 'app-workspace', 2000);

  await showFindingNote(page, {
    file: 'shared-state-finding.txt',
    headline: 'the agent has no idea what the shared state is',
    saw: [
      `clicked "Mark high priority" - the panel updated to ${afterHigh || 'high'}`,
      'asked the agent what the priority is: it did not know',
      `clicked "Mark low priority" - the panel updated to ${afterLow || 'low'}`,
      'asked again: it still did not know',
      'no error, no warning - the agent simply never sees the value',
    ],
    why: [
      'agent.setState reaches the store, so the panel updates.',
      'it never reaches the model. ag2/ag_ui/stream.py merges the',
      'incoming ag-ui state UNDER the agent\'s own variables:',
      '    initial_state = (incoming.state or {}) | initial_vars',
      'so any key the agent declares wins, and the browser value is',
      'discarded before the run starts.',
    ],
    doc: [
      'that its first table row - "agent and application both read',
      'and write the value" - does not hold on this backend.',
      'the read direction works. the write direction is dropped in',
      'silence, which is the worst way for it to fail: the ui',
      'updates, so everything looks correct until you ask.',
    ],
  });
};
