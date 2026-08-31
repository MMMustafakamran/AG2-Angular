/**
 * Frontend tools and generative UI — both halves work, and the card is wrong.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/frontend-tools-generative-ui
 *
 * Turn 1 calls `getWeather`, which runs in the AG2 process (backend/main.py);
 * the browser only renders it, through `app-weather-card`. Turn 2 calls
 * `change_background`, which runs in the browser and renders nothing in chat —
 * its result is the page itself repainting, so the cursor has to go and look at
 * the page.
 *
 * ── The finding this clip is built around ──────────────────────────────────
 * The card renders with an empty heading, and this is the hardest defect in the
 * repo to catch on video, because everything around it looks right: the tool
 * fires, the result is correct, the agent's prose answer names the city, and
 * the card mounts. Only the card's own <strong> is blank.
 *
 * The guide's component reads `call.args.city` in three places. The tool's
 * parameter is `location`. The names match — `getWeather` is `getWeather` — so
 * `registerRenderToolCall` binds and mounts; it is the argument contract that
 * does not, and the guide never states one.
 *
 * So the clip does two things a passing recording would not:
 *
 *   1. reads the card's heading out of the DOM and logs it, so the emptiness is
 *      recorded as a measurement and not left to the viewer's eye
 *   2. rests the cursor on the card's top edge, where the city name should be,
 *      before the note explains what is missing from that exact spot
 *
 * Without those the card just looks like a card, and this page records as a
 * clean pass — which is precisely the "silent failure" project-context.md lists
 * as a gap the pipeline misses.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { showFindingNote } from './finding-note';

/**
 * The card's heading — `{{ call.args.city }}` in the guide's own snippet.
 *
 * Returned as null when the card is absent so the caller can tell "no card" and
 * "card with a blank heading" apart. They are different findings.
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

  // Measure the heading rather than trusting the eye. This is the whole finding.
  const heading = await readCardHeading(page);
  if (heading === null) {
    console.warn(`   ⚠️ No app-weather-card in the DOM — nothing to measure.`);
  } else if (heading.length === 0) {
    console.log(
      `   🔎 Card heading is EMPTY, as expected: the guide reads call.args.city, ` +
        `the tool parameter is location.`,
    );
  } else {
    console.log(
      `   ✅ Card heading reads "${heading}" — the argument contract lines up ` +
        `after all; this finding is stale.`,
    );
  }

  // Rest on the card's top edge, where the city name should be. Aiming at the
  // centre would put the cursor on the result line, which is correct and
  // therefore the wrong thing to be looking at.
  const cardBox = await weatherCard.boundingBox().catch(() => null);
  if (cardBox) {
    console.log(`   🎯 Resting where the city name should be.`);
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

  // ── The finding, with the blank card still in the transcript behind it ────
  if (heading !== null && heading.length > 0) {
    // Nothing to report: the card filled in. Say so and leave the clip clean.
    console.log(`   · Card heading populated; skipping the finding note.`);
    return;
  }

  await showFindingNote(page, {
    file: 'frontend-tools-finding.txt',
    headline: 'the tool works, the card is blank, nothing errors',
    saw: [
      'asked for the weather: getWeather fired in the ag2 process',
      'the agent answered correctly, naming the city in prose',
      'app-weather-card mounted and rendered its result line',
      'its heading - where the city goes - rendered empty',
      'change_background then repainted the page: that half is fine',
    ],
    why: [
      'the guide\'s card reads call.args.city in three places.',
      'the tool parameter is location. so args.city is undefined.',
      'the NAME matches (getWeather), so registerRenderToolCall',
      'binds and mounts. only the argument contract is broken,',
      'and nothing on either side validates it.',
    ],
    doc: [
      'what arguments the renderer will receive. it shows a card',
      'reading .city and a tool taking .city, never saying the two',
      'must agree - so any backend naming it anything else gets',
      'this: a mounted card, a correct answer, and a blank field.',
    ],
  });
};
