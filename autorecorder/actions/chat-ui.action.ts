/**
 * Chat UI and customization — four surfaces, one tab strip.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/chat-ui
 *
 * Tabs 1 and 2 take a prompt each; tabs 3 and 4 are launcher surfaces, so the
 * thing to show there is the launcher opening, not another answer.
 *
 * Tab 2 replaces the assistant message component outright, so it renders no
 * `copilot-chat-assistant-message` at all — its completion is detected through
 * `app-custom-assistant-message` instead, passed per call rather than widened
 * into the global selector.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { waitForDomSettled } from './page-ready';

const CUSTOM_MESSAGE = 'app-custom-assistant-message';

/** Clicks one of the demo's surface tabs by its visible label. */
async function switchTab(page: Page, label: string): Promise<boolean> {
  const tab = page.locator(`button[role="tab"]:has-text("${label}")`).first();
  if (!(await tab.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.warn(`   ⚠️ tab "${label}" not found — skipping that surface.`);
    return false;
  }

  const box = await tab.boundingBox();
  if (box) {
    await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
    await humanClick(page);
  } else {
    await tab.click();
  }

  // Switching tabs destroys one chat and constructs another. That is first-load
  // all over again: the markup lands before the new component is wired up.
  await waitForDomSettled(page);
  return true;
}

/** Clicks a launcher button ("Open popup" / "Open sidebar") and rests on it. */
async function openLauncher(page: Page, label: string, restAt: [number, number]): Promise<void> {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.warn(`   ⚠️ "${label}" button not found.`);
    return;
  }

  const box = await btn.boundingBox();
  if (box) {
    await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
    await humanClick(page);
  } else {
    await btn.click();
  }

  await sleep(2000);
  await humanGlide(page, restAt[0], restAt[1], 22);
  await sleep(2000);
}

export const runChatUiAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const [inlinePrompt, customPrompt] = promptsFor(config);
  const wait = config.waitAfterPromptMs ?? 4000;

  // ── Tab 1: inline chat, with the guide's scoped bubble CSS applied ────────
  console.log(`   💬 Surface 1/4: inline copilot-chat (scoped .support-chat CSS)`);
  const inlineCount = await sendPrompt(page, inlinePrompt);
  await waitForAgentResponseCompletion(page, wait, inlineCount);

  // ── Tab 2: the replaced assistant message component ───────────────────────
  console.log(`   💬 Surface 2/4: replaced assistant message component`);
  if (await switchTab(page, 'Custom assistant message')) {
    const customCount = await sendPrompt(
      page,
      customPrompt ?? 'Tell me what makes your custom assistant layout unique.',
      {
        inputSelector: 'app-custom-message-chat textarea',
        submitSelector: 'app-custom-message-chat button[aria-label="Send message"]',
        messageSelector: CUSTOM_MESSAGE,
      },
    );
    await waitForAgentResponseCompletion(page, wait, customCount, CUSTOM_MESSAGE);
  }

  // ── Tab 3: popup launcher ─────────────────────────────────────────────────
  console.log(`   💬 Surface 3/4: copilot-popup`);
  if (await switchTab(page, 'Popup')) {
    await openLauncher(page, 'Open popup', [1580, 720]);
  }

  // ── Tab 4: sidebar launcher ───────────────────────────────────────────────
  // The open popup lays a backdrop over the tab strip, so the first click here
  // only dismisses it. Clicking the tab again is the fix, not a retry loop.
  console.log(`   💬 Surface 4/4: copilot-sidebar`);
  if (await switchTab(page, 'Sidebar')) {
    const sidebarBtn = page.locator('button:has-text("Open sidebar")').first();
    if (!(await sidebarBtn.isVisible({ timeout: 1200 }).catch(() => false))) {
      await switchTab(page, 'Sidebar');
    }
    await openLauncher(page, 'Open sidebar', [1680, 480]);
  }
};
