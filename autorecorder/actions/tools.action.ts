/**
 * Frontend tools and generative UI — both halves work.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/frontend-tools-generative-ui
 *
 * Turn 1 calls `getWeather`, which runs in the AG2 process (backend/main.py);
 * the browser only renders it, through `app-weather-card`. Turn 2 calls
 * `change_background`, which runs in the browser and renders nothing in chat —
 * its result is the page itself repainting, so the cursor has to go and look at
 * the page.
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

export const runToolsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const [weatherPrompt, backgroundPrompt] = promptsFor(config);
  const wait = config.waitAfterPromptMs ?? 4000;

  // ── Server-side tool, rendered by an Angular component ────────────────────
  console.log(`   🌤️ Server tool: ${weatherPrompt}`);
  const firstCount = await sendPrompt(page, weatherPrompt);

  // The card appears while the reply is still streaming; waiting for it here
  // separates "the tool renderer mounted" from "the turn finished", so a broken
  // renderer is visible as its own failure instead of a silent absence.
  const weatherCard = page.locator('app-weather-card').first();
  await weatherCard.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {
    console.warn(`   ⚠️ app-weather-card never rendered — tool call may not have fired.`);
  });

  await waitForAgentResponseCompletion(page, wait, firstCount);

  // Measure the heading rather than trusting the eye: a card that mounts with
  // an empty field looks like a card.
  const heading = await readCardHeading(page);
  if (heading === null) {
    console.warn(`   ⚠️ No app-weather-card in the DOM — nothing to measure.`);
  } else if (heading.length === 0) {
    console.warn(`   ⚠️ Card heading rendered empty — check the argument names.`);
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
};
