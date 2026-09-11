/**
 * Quickstart — the chat works, end to end.
 *
 * https://docs.copilotkit.ai/angular/ag2/quickstart
 *
 * One provider, one `<copilot-chat />`, and the agent answers. The clip is
 * assembled to show the whole path in order: the doc page, then this repo's own
 * backend/main.py in the IDE, then the working chat — Angular to runtime to AG2,
 * with nothing to annotate because nothing is wrong.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { beat, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

export const runQuickstartAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  console.log(`   🔍 Detecting demo page & chat component rendering...`);
  const initialMsgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(
    page,
    config.waitAfterPromptMs ?? 4000,
    initialMsgCount,
  );

  await beat(2400);
};
