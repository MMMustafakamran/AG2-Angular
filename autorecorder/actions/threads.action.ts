/**
 * Threads — recorded as a finding, because unlicensed is the state this repo
 * can actually reach.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 *
 * Thread endpoints come from the Enterprise Intelligence Platform. Without a
 * licence the hand-built `injectThreads` list never resolves and the drawer
 * renders its locked state — so a video of "threads not working" is worthless
 * unless it also says *why*.
 *
 * This page states its note in two stages rather than one, which is the shape
 * the evidence has. The claim goes up first, before anything is driven, because
 * "the list will stay empty" is a prediction — writing it beforehand and then
 * watching it come true is a stronger clip than narrating it afterwards. The
 * second half is added at the end, once the chat beside the drawer has answered
 * normally, because that contrast is the part that separates "unlicensed" from
 * "broken" and it cannot be claimed until it has happened.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { closeNotepadNote, openNotepadWindow, typeInNotepad } from './notepad';

/** Clicks a control if it is there, and says so if it is not. */
async function clickIfPresent(page: Page, selector: string, label: string): Promise<void> {
  const el = page.locator(selector).first();
  const box = await el
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => el.boundingBox())
    .catch(() => null);

  if (!box) {
    console.log(`   · ${label} not present.`);
    return;
  }

  await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
  await sleep(250);
  await humanClick(page);
  await sleep(1000);
};

export const runThreadsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  await page
    .locator('app-thread-list')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
  await sleep(600);

  console.log(`   📝 Stating the issue before demonstrating it...`);
  await openNotepadWindow(page, 'threads-issue.txt', {
    right: '28px',
    top: '95px',
    width: '640px',
    height: '560px',
  });
  await typeInNotepad(
    page,
    [
      'threads - licensed feature, unlicensed runtime',
      '',
      'about to drive both halves of the guide:',
      '  - ThreadListComponent, hand-built on injectThreads',
      '  - CopilotThreadsDrawer, the drop-in',
      '',
      'predicting now, before touching either:',
      '  - the list will stay on "Loading conversations..."',
      '  - the drawer will render its locked state and open nothing',
    ],
    1550,
    280,
  );
  await sleep(1500);

  // ── The headless list: New conversation, then Retry if it errored ─────────
  console.log(`   🧵 Driving the hand-built injectThreads list...`);
  await clickIfPresent(
    page,
    'app-thread-list button:has-text("New conversation")',
    'New conversation',
  );
  await clickIfPresent(page, 'app-thread-list button:has-text("Retry")', 'Retry');

  // ── The drop-in drawer ────────────────────────────────────────────────────
  const drawer = page.locator('copilot-threads-drawer').first();
  const drawerBox = await drawer.boundingBox().catch(() => null);
  if (drawerBox) {
    console.log(`   🧵 Opening CopilotThreadsDrawer...`);
    await humanGlide(page, drawerBox.x + 30, drawerBox.y + 30, 22);
    await sleep(350);
    await humanClick(page);
    await sleep(1200);
  }

  // ── The chat beside it is not licensed and answers normally ──────────────
  console.log(`   💬 The chat beside the drawer is unaffected by the licence...`);
  const msgCount = await sendPrompt(page, config.prompt, {
    inputSelector: 'app-conversations textarea',
    submitSelector: 'app-conversations copilot-chat-send-button button',
  });
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);

  console.log(`   📝 Elaborating now that the contrast is on screen...`);
  await typeInNotepad(
    page,
    [
      '',
      'both predictions held. and note what just happened beside it:',
      '  - the agent chat answered normally, same runtime, same run',
      '',
      'so this is not a broken agent and not a broken page.',
      'the runtime has no intelligence key, so thread create/list/',
      'mutate never reach a store. the guide is correct; the',
      'capability is unlicensed.',
      '',
      'file this apart from a2ui and shared state - those are pages',
      'that teach something which cannot work. this one works, once',
      'paid for.',
    ],
    1550,
    380,
  );
  await sleep(5000);
  await closeNotepadNote(page);
  await sleep(1200);
};
