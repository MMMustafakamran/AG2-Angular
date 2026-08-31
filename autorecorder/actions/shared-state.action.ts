/**
 * Shared state — the browser writes agent state, then the agent reads it back.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 *
 * Multi-turn demonstration:
 * 1. Click "Mark high priority" -> Ask "what is priority set as?"
 * 2. Click "Mark low priority"  -> Ask "what is priority set as?"
 * 3. Click "Use London time"    -> Ask "what is my timezone?"
 *
 * On AG2, turns 1 and 2 are expected to FAIL and the clip exists to show that.
 * The bridge merges incoming AG-UI state under the agent's own variables
 * (`initial_state = (incoming.state or {}) | initial_vars` in
 * ag2/ag_ui/stream.py), so the write never reaches the model and the agent has
 * no idea what priority is. Turn 3 is expected to pass: timezone travels as
 * read-only agent *context*, not state, and context is a separate path.
 *
 * Do not "fix" this by asserting on the answer — a passing turn 1 here would
 * mean the recorder was measuring something other than what the page claims.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

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

  // ── Turn 1: Mark High Priority ─────────────────────────────────────────────
  console.log(`   🔄 Step 1: Clicking "Mark high priority"...`);
  const highBtn = page
    .locator('app-workspace button:has-text("Mark high priority")')
    .first();

  const highBox = await highBtn.boundingBox().catch(() => null);
  if (highBox) {
    await humanGlide(page, highBox.x + highBox.width / 2, highBox.y + highBox.height / 2, 20);
    await sleep(400);
    await humanClick(page);
    await sleep(1000);
  } else {
    console.warn(`   ⚠️ "Mark high priority" button not found.`);
  }

  console.log(`   💬 Turn 1: ${highPrompt}`);
  const count1 = await sendPrompt(page, highPrompt);
  await waitForAgentResponseCompletion(page, wait, count1);
  await sleep(1000);

  // ── Turn 2: Mark Low Priority ──────────────────────────────────────────────
  console.log(`   🔄 Step 2: Clicking "Mark low priority"...`);
  const lowBtn = page
    .locator('app-workspace button:has-text("Mark low priority")')
    .first();

  const lowBox = await lowBtn.boundingBox().catch(() => null);
  if (lowBox) {
    await humanGlide(page, lowBox.x + lowBox.width / 2, lowBox.y + lowBox.height / 2, 20);
    await sleep(400);
    await humanClick(page);
    await sleep(1000);
  } else {
    console.warn(`   ⚠️ "Mark low priority" button not found.`);
  }

  console.log(`   💬 Turn 2: ${lowPrompt}`);
  const count2 = await sendPrompt(page, lowPrompt);
  await waitForAgentResponseCompletion(page, wait, count2);
  await sleep(1000);

  // ── Turn 3: Timezone Context ───────────────────────────────────────────────
  const timezoneBtn = page
    .locator('app-account-context button:has-text("Use London time")')
    .first();
  const tzBox = await timezoneBtn.boundingBox().catch(() => null);
  if (tzBox) {
    console.log(`   🌍 Step 3: Clicking "Use London time"...`);
    await humanGlide(page, tzBox.x + tzBox.width / 2, tzBox.y + tzBox.height / 2, 20);
    await sleep(400);
    await humanClick(page);
    await sleep(1000);
  } else {
    console.warn(`   ⚠️ "Use London time" button not found.`);
  }

  console.log(`   💬 Turn 3: ${tzPrompt}`);
  const count3 = await sendPrompt(page, tzPrompt);
  await waitForAgentResponseCompletion(page, wait, count3);

  // Rest on the context & state panel
  const accountContext = page.locator('app-account-context').first();
  const ctxBox = await accountContext.boundingBox().catch(() => null);
  if (ctxBox) {
    console.log(`   🎯 Resting on the read-only context component.`);
    await humanGlide(page, ctxBox.x + ctxBox.width / 2, ctxBox.y + ctxBox.height / 2, 22);
    await sleep(1500);
  }
};

