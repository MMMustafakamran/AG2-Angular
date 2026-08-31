/**
 * Memory — the `isAvailable()` gate is the lesson, and here it is false.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 *
 * This runtime serves no memory routes, so the guide's fallback branch is what
 * renders. That makes this the mildest page in the repo: the guide told the
 * reader to gate on `isAvailable()`, the gate did its job, and the fallback
 * message appeared instead of a broken control. The feature is unavailable, but
 * the documentation is not wrong.
 *
 * The clip is built to say exactly that much and no more. Rest on the panel so
 * the fallback is legible, prompt the chat so the same run shows the agent
 * answering normally, and let the note draw the line between "premium feature
 * absent" and "page defective" — because a viewer scrubbing a folder of AG2
 * clips will otherwise file this next to A2UI and Shared state, which are a
 * different thing entirely.
 *
 * That distinction is worth a note of its own. A QA report that marks four
 * pages red without separating "the docs are wrong" from "you have not paid
 * for this" is a report nobody can act on.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { dwellOn, showFindingNote } from './finding-note';

export const runMemoryAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  console.log(`   🧠 Resting on the injectMemories panel (isAvailable() gate)...`);
  const panelFound = await dwellOn(page, 'app-memory-list', 2400);
  if (!panelFound) {
    console.warn(`   ⚠️ app-memory-list not on screen — nothing to rest on.`);
  }

  // The same run has to show the agent working, or the clip reads as a dead
  // stack rather than as one absent feature.
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
  await sleep(1200);

  await dwellOn(page, 'app-memory-list', 1800);

  await showFindingNote(page, {
    file: 'memory-finding.txt',
    headline: 'memory is absent, and the guide handled it correctly',
    saw: [
      'injectMemories mounted; isAvailable() returned false',
      'the guide\'s fallback message rendered in place of controls',
      'no error, no empty list pretending to be a loaded one',
      'the chat beside it answered normally in the same run',
    ],
    why: [
      'the memory routes come from copilotkit intelligence, which',
      'this runtime has no key for. so the capability is genuinely',
      'not there, and the gate the guide insists on caught it.',
    ],
    doc: [
      'nothing wrong here. this page is NOT a defect.',
      'filing it beside a2ui or shared state would be a mistake:',
      'those are pages that teach something that cannot work.',
      'this is a page that works, gated on a feature we have not',
      'licensed. same red mark, completely different fix.',
    ],
  });
};
