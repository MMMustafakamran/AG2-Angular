/**
 * Frontend tools and generative UI — two halves work, the third is the finding.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/frontend-tools-generative-ui
 *
 * Turn 1 calls `getWeather`, which runs in the AG2 process (backend/main.py);
 * the browser only renders it, through `app-weather-card`. Turn 2 calls
 * `change_background`, which runs in the browser and renders nothing in chat —
 * its result is the page itself repainting, so the cursor has to go and look at
 * the page.
 *
 * Turn 3 is the guide's new first section, `registerComponent`, and it is why
 * this clip exists. The card renders correctly and then the agent posts a second
 * message apologising for it. Four defects sit in that one turn, all in the
 * snippet as published against @copilotkit/angular 0.5.1:
 *
 *   1. No handler means core returns an empty tool result, the model reads the
 *      emptiness as failure, and it apologises for the card it just drew.
 *      `followUp: false` suppresses it; the guide never mentions `followUp`.
 *   2. The snippet guards on `status === "in-progress"`. The real status while
 *      arguments stream is `"executing"`, so the guard never fires and the
 *      `@else` branch paints an empty card until the args land.
 *   3. The status never reaches `"complete"` at all — sampled once a second for
 *      25 seconds. The `registerRenderToolCall` snippet higher up this same page
 *      gates its content on `"complete"`, so that documented pattern applied
 *      here would load forever.
 *   4. The snippet ships no CSS, and Angular's default `preserveWhitespaces:
 *      false` strips the gap between `</strong>` and `<span>`, so the "card"
 *      renders as the unstyled run-together string `INC-4711sev1`. Nothing is
 *      restyled here — the guide's own output is the finding.
 *
 * The card is waited for separately from the reply, so "the tool renderer
 * mounted" and "the turn finished" stay legible as two different things, and its
 * heading is read out of the DOM and logged — a rendered card with an empty
 * field would otherwise look identical on video to a correct one.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';
import { closeNotepadNote, openNotepadWindow, typeInNotepad } from './notepad';

/**
 * The card's heading — `{{ call.args.city }}` in the guide's own snippet.
 *
 * Returned as null when the card is absent so the caller can tell "no card" and
 * "card with a blank heading" apart. They are different results.
 */
async function readCardHeading(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const card = document.querySelector('app-weather-card');
      if (!card) return null;
      const strong = card.querySelector('strong');
      return (strong?.textContent ?? '').trim();
    })
    .catch(() => null);
}

/**
 * The incident card's two fields. Read separately from "is it in the DOM",
 * because the finding is a card that mounts with both of them empty.
 */
async function readIncidentCard(
  page: Page,
): Promise<{ id: string; severity: string } | null> {
  return page
    .evaluate(() => {
      const card = document.querySelector('app-incident-card');
      if (!card) return null;
      return {
        id: (card.querySelector('strong')?.textContent ?? '').trim(),
        severity: (card.querySelector('span')?.textContent ?? '').trim(),
      };
    })
    .catch(() => null);
}

export const runToolsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
  _rootPath,
  ctx,
) => {
  const [weatherPrompt, backgroundPrompt, incidentPrompt] = promptsFor(config);
  const wait = config.waitAfterPromptMs ?? 4000;

  // ── Server-side tool, rendered by an Angular component ────────────────────
  console.log(`   🌤️ Server tool: ${weatherPrompt}`);
  const firstCount = await sendPrompt(page, weatherPrompt);

  // The card appears while the reply is still streaming; waiting for it here
  // separates "the tool renderer mounted" from "the turn finished", so a broken
  // renderer is visible as its own failure instead of a silent absence.
  const weatherCard = page.locator('app-weather-card').first();
  await weatherCard.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {
    ctx.fail('app-weather-card never rendered -- the getWeather tool call did not fire or its renderer did not mount.');
  });

  await waitForAgentResponseCompletion(page, wait, firstCount);

  // Measure the heading rather than trusting the eye: a card that mounts with
  // an empty field looks like a card.
  const heading = await readCardHeading(page);
  if (heading === null) {
    // Already failed above when the card never appeared; nothing to add.
  } else if (heading.length === 0) {
    ctx.warn('Weather card heading rendered empty -- the argument names in the renderer do not match the tool call.');
  } else {
    console.log(`   ✅ Card heading reads "${heading}".`);
  }

  // Rest on the card's top edge, where the city name is, then move to the
  // result line below it.
  const cardBox = await weatherCard.boundingBox().catch(() => null);
  if (cardBox) {
    console.log(`   🎯 Resting on the card.`);
    await humanGlide(page, cardBox.x + 60, cardBox.y + 18, 22);
    await sleep(2600);
    await humanGlide(page, cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, 18);
    await sleep(1600);
  }

  // ── Browser-side tool, whose only output is the page repainting ───────────
  if (backgroundPrompt) {
    console.log(`   🎨 Frontend tool: ${backgroundPrompt}`);
    const secondCount = await sendPrompt(page, backgroundPrompt);
    await waitForAgentResponseCompletion(page, 3000, secondCount);

    console.log(`   ✨ Showing the repainted background.`);
    await humanGlide(page, 500, 350, 25);
    await sleep(1000);
    await humanGlide(page, 700, 520, 25);
    await sleep(2000);
  }

  // ── Display-only registration: the guide's new section, and the finding ───
  if (!incidentPrompt) return;

  console.log(`   🪪 Display-only tool: ${incidentPrompt}`);
  const thirdCount = await sendPrompt(page, incidentPrompt);

  const incidentCard = page.locator('app-incident-card').first();
  await incidentCard.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {
    ctx.fail('app-incident-card never rendered -- registerComponent did not fire.');
  });

  // Sampled the instant it mounts. The guide's in-progress guard does not fire,
  // so this is where the empty-card frame is caught if it is catchable.
  const atMount = await readIncidentCard(page);
  console.log(
    `   🔎 At mount: id="${atMount?.id ?? '(no card)'}" severity="${atMount?.severity ?? ''}"`,
  );

  await waitForAgentResponseCompletion(page, wait, thirdCount);

  const settled = await readIncidentCard(page);
  if (settled && settled.id) {
    console.log(`   ✅ Card settled correct: ${settled.id} / ${settled.severity}.`);
  } else {
    ctx.warn('Incident card mounted but never filled in -- id and severity stayed empty after the reply settled.');
  }

  // Rest on the card, then travel down to the apology underneath it. The two
  // being on screen together is the whole point of the shot.
  const incidentBox = await incidentCard.boundingBox().catch(() => null);
  if (incidentBox) {
    console.log(`   🎯 Resting on the correct card.`);
    await humanGlide(page, incidentBox.x + 60, incidentBox.y + 18, 22);
    await sleep(2400);
    console.log(`   👇 Travelling to the apology beneath it.`);
    await humanGlide(page, incidentBox.x + 80, incidentBox.y + incidentBox.height + 70, 20);
    await sleep(2600);
  }

  // Anchored left, over the repainted background rather than the chat: the
  // card and the apology under it are the evidence, and they live on the right.
  console.log(`   📝 Writing the four findings up while they are on screen...`);
  await openNotepadWindow(page, 'registercomponent-findings.txt', {
    left: '28px',
    right: 'auto',
    transform: 'none',
    top: '95px',
    width: '640px',
    height: '430px',
  });
  await typeInNotepad(
    page,
    [
      '1. the card is right. the apology under it is not.',
      '   no handler means no result, and the model reads',
      '   that as failure. followUp: false fixes it, and',
      '   the guide never mentions followUp.',
    ],
    340,
    260,
  );
  await sleep(3000);

  await typeInNotepad(
    page,
    [
      '',
      '',
      '2. the snippet guards on status "in-progress".',
      '   the real status is "executing", so the guard',
      '   never fires and the card paints empty first.',
      '',
      '3. status never reaches "complete". the other',
      '   renderer on this page says to gate on complete.',
      '   do that here and it loads forever.',
    ],
    340,
    340,
  );
  await sleep(3400);

  await typeInNotepad(
    page,
    [
      '',
      '',
      '4. no css in the snippet, and angular strips the',
      '   gap between the tags. renders INC-4711sev1.',
      '   not a card.',
      '',
      'also: no imports shown, no mention of injection',
      'context, and your description gets a preamble',
      'prepended before the model sees it.',
    ],
    340,
    420,
  );
  await sleep(4200);
  await closeNotepadNote(page);
  await sleep(1200);
};
