/**
 * Human-in-the-loop — the agent pauses for a human decision and resumes.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/human-in-the-loop
 *
 * The guide opens on a table with two rows, and both are mounted above the chat
 * in this demo so one frame carries the lot:
 *
 *   | pattern                | angular api                            |
 *   | human-in-the-loop tool | registerHumanInTheLoop                 |
 *   | interrupt              | injectInterrupt, interruptController   |
 *
 * The clip drives the decision tool: the agent asks for something consequential,
 * the run stops on the approval card, Approve is clicked, and the decision goes
 * back so the run can finish. The interrupt panels sit directly above it and are
 * visited afterwards, once the pause-and-resume cycle has completed.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { dwellOn } from './finding-note';

/**
 * The two interrupt surfaces the guide teaches, both mounted in this demo:
 * `injectInterrupt` (InterruptPanelComponent) and the store's own
 * `interruptController` (TicketApprovalComponent).
 *
 * Both render nothing at all until an interrupt arrives, so "did it render?" is
 * measured as visible text rather than as element presence — the components are
 * always in the DOM, and always empty.
 */
const INTERRUPT_PANELS = ['app-interrupt-panel', 'app-ticket-approval'];

/** How much visible text the interrupt panels are carrying. */
async function interruptPanelText(page: Page): Promise<string> {
  return page
    .evaluate((selectors) => {
      return selectors
        .map((sel) => (document.querySelector(sel)?.textContent || '').trim())
        .join(' ')
        .trim();
    }, INTERRUPT_PANELS)
    .catch(() => '');
}

export const runHitlAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  // ── Half one: the decision tool. This is the half that works ─────────────
  console.log(`   🛡️ Asking for something consequential enough to need approval...`);
  const msgCount = await sendPrompt(page, config.prompt);

  const approvalCard = page.locator('app-approval-card').first();
  const cardAppeared = await approvalCard
    .waitFor({ state: 'visible', timeout: 25000 })
    .then(() => true)
    .catch(() => false);

  if (!cardAppeared) {
    // Not fatal here: the reply still has to arrive, and the completion wait
    // below is what decides whether this page passed. But the whole point of
    // the page is the pause, so say plainly that it did not happen.
    console.warn(
      `   ⚠️ app-approval-card never appeared — the agent answered without ` +
        `calling requestApproval, so nothing was paused.`,
    );
  } else {
    console.log(`   ⏸️ Run paused on the approval card. Reading it...`);
    await sleep(1800);

    const approveBtn = page
      .locator('app-approval-card button:has-text("Approve")')
      .first();

    const box = await approveBtn.boundingBox().catch(() => null);
    if (box) {
      console.log(`   👉 Approving.`);
      await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
      await sleep(600);
      await humanClick(page);
    } else {
      await approveBtn.click().catch(() => {});
    }
  }

  // The decision returns to the agent and the run continues, so the reply that
  // matters is the one after the click.
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
  await sleep(1200);

  // ── Half two: the interrupt controllers ──────────────────────────────────
  //
  // The run just completed a full pause-and-resume cycle, so anything the
  // guide's interrupt path was going to show has had its chance by now.
  const panelText = await interruptPanelText(page);
  console.log(
    panelText.length > 0
      ? `   ✅ An interrupt panel rendered content — ag2 emits interrupts after all: "${panelText.slice(0, 120)}"`
      : `   · Both interrupt panels are empty, as expected: ag2 emits no interrupt event.`,
  );

  console.log(`   🔍 Travelling up to the interrupt panels...`);
  await dwellOn(page, INTERRUPT_PANELS[0], 1600);
  await dwellOn(page, INTERRUPT_PANELS[1], 1600);
};
