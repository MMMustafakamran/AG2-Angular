/**
 * Memory — the `isAvailable()` gate is the lesson, and here it is false.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 *
 * This runtime serves no memory routes, so the guide's fallback branch is what
 * renders. Resting on that panel before prompting is what makes the recording
 * legible: the chat answers, the memory list says it cannot, and both are on
 * screen in the same video.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

export const runMemoryAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const panel = page.locator('app-memory-list').first();
  const box = await panel.boundingBox().catch(() => null);
  if (box) {
    console.log(`   🧠 Resting on the injectMemories panel (isAvailable() gate)...`);
    await humanGlide(page, box.x + box.width / 2, box.y + 40, 22);
    await sleep(1800);
  }

  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
};
