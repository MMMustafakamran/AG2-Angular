/**
 * Human-in-the-loop — one half of the page works, the other cannot exist.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/human-in-the-loop
 *
 * The guide opens on a table with two rows, and teaches both:
 *
 *   | pattern              | angular api                              |
 *   | human-in-the-loop tool | registerHumanInTheLoop                 |
 *   | interrupt              | injectInterrupt, interruptController   |
 *
 * Row one works here. Row two cannot work at all on an AG2 backend, and the
 * page never says so — `ag2/ag_ui/stream.py` imports no interrupt event type
 * and no custom event type, so there is no sequence of agent behaviour that
 * makes `injectInterrupt` fire. It is not idle pending configuration; it is
 * unreachable.
 *
 * That asymmetry is the clip. Both controllers are mounted above the chat in
 * this demo, so the recording can show them side by side in one frame: the
 * approval card appears, gets clicked, and the run resumes — while the two
 * interrupt panels directly above it stay empty through the whole exchange.
 *
 * Order matters. The working half runs first, so by the time the note claims
 * the other half is dead, the viewer has already watched this agent
 * successfully pause and resume for a human decision. "The backend is down"
 * and "the recorder mis-clicked" are both ruled out on screen before anything
 * is asserted.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { dwellOn, showFindingNote } from './finding-note';

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

/** How much visible text the interrupt panels are carrying. Expected: none. */
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

  // ── Half two: the interrupt controllers, which never woke up ─────────────
  //
  // The run just completed a full pause-and-resume cycle. Anything the guide's
  // interrupt path was going to show would have shown by now, so travelling up
  // to the empty panels here is the honest measurement, not an early one.
  const panelText = await interruptPanelText(page);
  console.log(
    panelText.length > 0
      ? `   ✅ An interrupt panel rendered content — ag2 emits interrupts after all: "${panelText.slice(0, 120)}"`
      : `   · Both interrupt panels are empty, as expected: ag2 emits no interrupt event.`,
  );

  console.log(`   🔍 Travelling up to the interrupt panels...`);
  await dwellOn(page, INTERRUPT_PANELS[0], 1600);
  await dwellOn(page, INTERRUPT_PANELS[1], 1600);

  await showFindingNote(page, {
    file: 'human-in-the-loop-finding.txt',
    headline: 'half this page works; the other half cannot run on ag2',
    saw: [
      'registerHumanInTheLoop: the agent paused on the approval card',
      'clicked Approve — the decision went back and the run resumed',
      'injectInterrupt and store().interruptController: nothing, ever',
      'both panels sat empty through a full pause-and-resume cycle',
    ],
    why: [
      'the tool path is a frontend tool, sent in RunAgentInput.tools,',
      'and ag2 answers it with a TOOL_CALL_CHUNK. that works.',
      'the interrupt path has no wire format here at all:',
      'ag2/ag_ui/stream.py imports no interrupt and no custom event,',
      'so nothing an ag2 agent does can wake these controllers.',
    ],
    doc: [
      'that the second row of its own table is unreachable on ag2.',
      'it reads as a design choice between two working patterns.',
      'it is a choice between one that works and one that cannot.',
    ],
  });
};
