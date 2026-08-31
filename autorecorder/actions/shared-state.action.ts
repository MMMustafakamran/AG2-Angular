/**
 * Shared state — the browser writes agent state, and the agent never sees it.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 *
 * The guide opens on a table with two rows. Row one is "Agent and application
 * both read and write the value → injectAgentStore and agent.setState". On an
 * AG2 backend that row is false, and this clip is built to prove it rather than
 * to work around it.
 *
 * The demonstration is a contrast, in this order:
 *
 *   1. click "Mark high priority" — the panel updates, so the write reached the
 *      store. Ask the agent. It does not know. (write dropped)
 *   2. click "Mark low priority" — same again, so turn 1 was not a fluke and
 *      not a timing artefact. (still dropped)
 *   3. click "Use London time" and ask. The agent answers correctly. (context
 *      works)
 *
 * Step 3 is what makes the clip a finding instead of a shrug: the same page,
 * the same agent, the same run — one mechanism works and the other does not, so
 * "the backend is just down" is off the table by the time the note appears.
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
 * the backend so turn 1 passes. A green turn 1 here would mean the recorder was
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
  // Rest on the panel afterwards: the value visibly changes in the UI, which is
  // the half of the round trip that DOES work and has to be seen working.
  await sleep(1400);
}

export const runSharedStateAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const [
    highPrompt = 'what is priority set as?',
    lowPrompt = 'what is priority set as?',
    tzPrompt = 'what is my timezone?',
  ] = promptsFor(config);
  const wait = config.waitAfterPromptMs ?? 4000;

  // ── Turn 1: the browser writes state, the agent is asked to read it ───────
  await clickStateButton(
    page,
    'app-workspace button:has-text("Mark high priority")',
    'Mark high priority',
  );

  // Rest on the panel first. `Priority: high` is on screen, so when the agent
  // says it does not know, the viewer has already seen that the value exists.
  await dwellOn(page, 'app-workspace', 1800);

  console.log(`   💬 Turn 1 (expect the agent NOT to know): ${highPrompt}`);
  const count1 = await sendPrompt(page, highPrompt);
  await waitForAgentResponseCompletion(page, wait, count1);
  await sleep(1200);

  // ── Turn 2: same again, so turn 1 cannot be read as a one-off ────────────
  await clickStateButton(
    page,
    'app-workspace button:has-text("Mark low priority")',
    'Mark low priority',
  );
  await dwellOn(page, 'app-workspace', 1500);

  console.log(`   💬 Turn 2 (expect the same): ${lowPrompt}`);
  const count2 = await sendPrompt(page, lowPrompt);
  await waitForAgentResponseCompletion(page, wait, count2);
  await sleep(1200);

  // ── Turn 3: the control. Read-only context travels a different path ──────
  await clickStateButton(
    page,
    'app-account-context button:has-text("Use London time")',
    'Use London time',
  );

  console.log(`   💬 Turn 3 (expect the agent to KNOW — context, not state): ${tzPrompt}`);
  const count3 = await sendPrompt(page, tzPrompt);
  await waitForAgentResponseCompletion(page, wait, count3);

  await dwellOn(page, 'app-account-context', 2000);

  // ── The finding, with all three turns still in the transcript behind it ───
  await showFindingNote(page, {
    file: 'shared-state-finding.txt',
    headline: 'shared state is read-only on ag2 — writes are dropped',
    saw: [
      'clicked "Mark high priority": the panel updated to high',
      'asked the agent: it did not know the priority',
      'clicked "Mark low priority": same result, so not a timing fluke',
      'clicked "Use London time": the agent DID know the timezone',
    ],
    why: [
      'agent.setState reaches the store but never the model.',
      'ag2/ag_ui/stream.py merges incoming state UNDER agent variables:',
      '    initial_state = (incoming.state or {}) | initial_vars',
      'so any key the agent declares wins and the browser value is lost.',
      'turn 3 works because read-only context is a separate path.',
    ],
    doc: [
      'that its first table row - "agent and application both read',
      'and write the value" - does not hold on this backend.',
      'nor that there is no STATE_DELTA: state moves only at the',
      'start and end of a run, never during it.',
    ],
  });
};
