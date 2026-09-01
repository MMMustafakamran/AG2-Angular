/**
 * Attachments — pick a real file, send it, and make the agent prove it read it.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 *
 * The mechanics — drawing the fixture, intercepting the file chooser, and
 * filming a dialog Playwright would otherwise suppress — live in
 * `attach-image.ts`, because the Voice & multimodal page needs exactly the same
 * flow as its control: there, a working image path is what proves the silent
 * microphone is a broken input rather than a broken page. Sharing the helper
 * means both clips produce that evidence identically, and the three traps it
 * documents stay fixed in one place.
 *
 * What is left here is the part specific to this page: attach, ask, and hold
 * on the answer. The prompt asks for two values that exist only inside the
 * image, so a correct answer is proof the file reached the model. A generic
 * "what kind of attachments do you support?" could be answered from the system
 * prompt alone, which is how a broken upload comes to look fine on video.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { attachImage } from './attach-image';

export const runAttachmentsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
  rootPath: string,
) => {
  await attachImage(page, rootPath);

  // The composer moves down once the queue appears, so the prompt is typed
  // after the attachment, never before.
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
  await sleep(1200);
};
