/**
 * Quickstart — the chat works, and you could not have built it from that page.
 *
 * https://docs.copilotkit.ai/angular/ag2/quickstart
 *
 * This is the one clip whose finding is not visible in the demo, because the
 * demo is fine: one provider, one `<copilot-chat />`, and the agent answers.
 * Nothing to point a cursor at.
 *
 * The defect is in Step 1 of the recording — the doc page the viewer has just
 * watched scroll past. Where the AG2 server should be, the page ships:
 *
 *     <!-- setup skipped: agent-setup is not bundled for ag2 -->
 *
 * and then sends the reader to "the selected backend's Copilot Runtime guide",
 * which is the generic `BuiltInAgent` page and says nothing about AG2. So the
 * Angular AG2 path never shows a line of AG2 code, start to finish.
 *
 * The order the clip is assembled in is what makes this land. Doc page, then
 * this repo's own backend/main.py in the IDE, then a working chat — and only
 * then the note pointing out that the middle panel came from ag2ai/ag2-samples
 * rather than from the page at the top. The viewer has already seen all three
 * things by the time the claim is made.
 *
 * A note on a passing page is deliberate. project-context.md: "a clean run that
 * finds nothing when the docs are broken is a failed run". A green quickstart
 * with no annotation is exactly that failed run — it reports that the page
 * works, when what it actually proves is that the page works once someone else
 * supplies the step the page omits.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { showFindingNote } from './finding-note';

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

  await sleep(1200);

  await showFindingNote(page, {
    file: 'quickstart-finding.txt',
    headline: 'the quickstart works, and it cannot be followed',
    saw: [
      'the doc page at the top of this clip: every angular step present',
      'where the ag2 server should be, one html comment instead:',
      '    "setup skipped: agent-setup is not bundled for ag2"',
      'the backend shown in the ide came from ag2ai/ag2-samples',
      'the chat then works end to end: angular -> runtime -> ag2',
    ],
    why: [
      'the page defers its backend step to the selected integration,',
      'then links "the selected backend\'s copilot runtime guide" -',
      'which is the generic BuiltInAgent page, and mentions no ag2.',
      'so the angular ag2 path never shows a line of ag2 code.',
    ],
    doc: [
      'how to build the process the rest of the page talks to.',
      'a reader following this page end to end has a frontend',
      'pointed at a runtime pointed at a backend that was never',
      'described. the working chat above is not evidence the page',
      'is complete - it is evidence someone filled the gap by hand.',
    ],
  });
};
