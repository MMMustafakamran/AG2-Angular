/**
 * Frontend tools and generative UI — the two halves of the guide, one turn each.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/frontend-tools-generative-ui
 *
 * Turn 1 calls `getWeather`, which runs in the AG2 process
 * (backend/main.py); the browser only renders it, through `app-weather-card`.
 * Turn 2 calls `change_background`, which runs in the browser and renders
 * nothing in chat — its result is the page itself repainting, so the cursor
 * has to go and look at the page.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

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

  const cardBox = await weatherCard.boundingBox().catch(() => null);
  if (cardBox) {
    await humanGlide(
      page,
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2,
      22,
    );
    await sleep(2000);
  }

  // ── Browser-side tool, whose only output is the page repainting ───────────
  if (!backgroundPrompt) return;
  console.log(`   🎨 Frontend tool: ${backgroundPrompt}`);
  const secondCount = await sendPrompt(page, backgroundPrompt);
  await waitForAgentResponseCompletion(page, 3000, secondCount);

  console.log(`   ✨ Showing the repainted background.`);
  await humanGlide(page, 500, 350, 25);
  await sleep(1000);
  await humanGlide(page, 700, 520, 25);
  await sleep(2000);
};
