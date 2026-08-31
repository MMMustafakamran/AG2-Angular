/**
 * Headless UI — a transcript and composer with no CopilotKit chrome at all.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 *
 * Everything here is hand-written over `injectAgentStore`, so none of the
 * default selectors apply: the composer is a bare `textarea[aria-label=Message]`
 * with a plain "Send" button, and replies render as
 * `article[data-role="assistant"]`. That selector is passed per call rather than
 * widened globally — a page that renders its own message view is exactly the
 * case the `messageSelector` option exists for.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

const HEADLESS_MESSAGE = 'article[data-role="assistant"]';

export const runHeadlessAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  console.log(`   🧩 Driving the hand-built composer...`);
  const msgCount = await sendPrompt(page, config.prompt, {
    inputSelector: 'app-headless-chat textarea[aria-label="Message"]',
    submitSelector: 'app-headless-chat button:has-text("Send")',
    messageSelector: HEADLESS_MESSAGE,
  });

  await waitForAgentResponseCompletion(
    page,
    config.waitAfterPromptMs ?? 4000,
    msgCount,
    HEADLESS_MESSAGE,
  );
};
