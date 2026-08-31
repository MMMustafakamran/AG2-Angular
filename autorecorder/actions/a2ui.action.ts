/**
 * A2UI — enabled on the runtime, inert in the browser, and the recording says so.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/a2ui
 *
 * `a2ui: {}` in frontend/server.ts turns the middleware on and `/info` duly
 * reports `a2uiEnabled: true`, but supplying `a2ui.catalog` is what actually
 * registers the `render_a2ui` renderer — and the guide's catalog snippet is not
 * self-contained (it references `dynamicString`, `beautifulCatalog`,
 * `declarativeCatalog`, `fixedCatalog` and `productCatalog`, none of which the
 * guide defines). So the agent answers in prose and no declarative UI appears.
 *
 * The prompt is still sent: "asked for a card, got a paragraph" is the finding,
 * and it is only demonstrable by asking. The Notepad note then records what is
 * missing, while the prose answer is still on screen behind it.
 *
 * The legacy recorder made this a doc-only page and highlighted the missing
 * identifiers in the guide itself. This engine always drives the demo route, so
 * the finding moved onto the demo page — the substance is the same, and the doc
 * scroll at the head of the video still shows the snippets in question.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { closeNotepadNote, openNotepadWindow, typeInNotepad } from './notepad';

/** Anything the A2UI renderer would have mounted. */
const A2UI_SURFACE =
  'copilot-a2ui, [class*="a2ui"], .a2ui-row, .a2ui-flight-card';

export const runA2uiAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  console.log(`   🎨 Asking for declarative UI: ${config.prompt}`);
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);

  const rendered = await page.locator(A2UI_SURFACE).count().catch(() => 0);
  console.log(
    rendered > 0
      ? `   ✅ ${rendered} A2UI element(s) rendered — a catalog is registered after all.`
      : `   · No A2UI elements rendered, as expected without a catalog.`,
  );

  await openNotepadWindow(page, 'a2ui-notes.txt', {
    right: '32px',
    top: '95px',
    width: '680px',
    height: '560px',
  });

  await typeInNotepad(
    page,
    rendered > 0
      ? [
      'a2ui rendering',
      '',
      'declarative UI is mounted; this note is stale',
      'update pages.config.ts and remove it from README known issues.',
    ]
    :
    [
      'a2ui enabled but inert',
      '',
      'a2ui isenabled, but no declarative UI is rendered',
      'the renderer expects a2ui.catalog, which is not set',
      'the guide needs a complete catalog example.',
    ],
    1550,
    260,
  );

  console.log(`   📖 Holding on the note...`);
  await humanGlide(page, 1550, 360, 20);
  await sleep(5000);
  await closeNotepadNote(page);
  await sleep(1200);
};
