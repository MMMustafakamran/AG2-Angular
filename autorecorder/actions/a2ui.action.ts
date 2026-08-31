/**
 * A2UI — enabled on the runtime, inert in the browser, and the recording says so.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/a2ui
 *
 * `a2ui: {}` in frontend/server.ts turns the middleware on and `/info` duly
 * reports `a2uiEnabled: true`, but supplying `a2ui.catalog` is what actually
 * registers the `render_a2ui` renderer — and the guide's catalog snippet is not
 * self-contained. It references `dynamicString`, `beautifulCatalog`,
 * `declarativeCatalog`, `fixedCatalog` and `productCatalog`, and defines none of
 * them. There is no way to complete the page from the page.
 *
 * So the agent answers in prose and no declarative UI appears.
 *
 * The prompt is still sent, and that is the design: "asked for a card, got a
 * paragraph" is the finding, and it is only demonstrable by asking. A clip that
 * skipped the prompt would show an empty page and prove nothing — an empty page
 * is what a page with no feature on it looks like too.
 *
 * `a2uiEnabled: true` is the trap worth filming. Everything a reader would check
 * to confirm the setup reports success: the middleware is on, /info agrees, the
 * frontend needs no wiring per the guide's own "activates automatically". The
 * only signal that anything is wrong is the absence of a card nobody promised a
 * specific shape for.
 *
 * The legacy recorder made this a doc-only page and highlighted the missing
 * identifiers in the guide itself. This engine always drives the demo route, so
 * the finding moved onto the demo page — the substance is the same, and the doc
 * scroll at the head of the video still shows the snippets in question.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { dwellOn, showFindingNote } from './finding-note';

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

  // Rest on the prose answer. It is the evidence: the agent understood the
  // request and replied in text, which is what "the renderer never registered"
  // looks like from the outside.
  await dwellOn(page, 'copilot-chat', 2000);
  await sleep(800);

  if (rendered > 0) {
    await showFindingNote(page, {
      file: 'a2ui-finding.txt',
      headline: 'a2ui rendered — this finding is stale, remove it',
      saw: [
        `${rendered} declarative element(s) mounted in the chat`,
        'a catalog is registered somewhere after all',
      ],
      why: [
        'something now supplies a2ui.catalog. find it, and drop this',
        'page from the known issues list in readme.md.',
      ],
    });
    return;
  }

  await showFindingNote(page, {
    file: 'a2ui-finding.txt',
    headline: 'a2ui reports enabled and renders nothing',
    saw: [
      'asked the agent for declarative ui',
      'it understood, and answered in prose',
      'no a2ui element mounted anywhere in the chat',
      'no error, no warning, clean console',
    ],
    why: [
      'a2ui: {} in server.ts turns the middleware on, and',
      '/api/copilotkit/info duly reports a2uiEnabled: true.',
      'but the render_a2ui renderer is registered by supplying',
      'a2ui.catalog, which nothing here does - because the',
      'guide\'s catalog snippet references dynamicString,',
      'beautifulCatalog, declarativeCatalog, fixedCatalog and',
      'productCatalog, and defines none of them.',
    ],
    doc: [
      'that a catalog is required, or what one contains.',
      'it says the renderer "activates automatically" and that',
      '"no extra configuration is needed" - both true only once',
      'a catalog exists. every check a reader would run to verify',
      'the setup reports success. the page cannot be completed',
      'from the page.',
    ],
  });
};
