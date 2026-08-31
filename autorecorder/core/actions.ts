import { type Page } from 'playwright';
import { SELECTORS } from '../config/selectors.config';
import { humanClick, humanGlide, sleep } from './overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from './types';
/**
 * Assistant messages as CopilotKit's own prebuilt components render them.
 *
 * Pages that replace the message view via a slot render none of these classes,
 * so they must pass their own selector -- see the `slots` level-3 handler.
 */
export const DEFAULT_ASSISTANT_MESSAGE_SELECTOR = SELECTORS.assistantMessage;

/**
 * Returns the current count of assistant message elements in the DOM
 */
export async function getAssistantMessageCount(
  page: Page,
  messageSelector: string = DEFAULT_ASSISTANT_MESSAGE_SELECTOR,
): Promise<number> {
  return page
    .evaluate((sel) => document.querySelectorAll(sel).length, messageSelector)
    .catch(() => 0);
}

/**
 * Actively waits until:
 * 1. An assistant response message appears with text content.
 * 2. Streaming finishes (text content stops changing for 1.6+ seconds).
 * 3. Glides the mouse over the response and waits postWaitMs (default 4000ms) for reading.
 */
export async function waitForAgentResponseCompletion(
  page: Page,
  postWaitMs = 4000,
  initialMessageCount?: number,
  messageSelector: string = DEFAULT_ASSISTANT_MESSAGE_SELECTOR,
): Promise<void> {
  console.log(`   ⏳ Actively detecting AI agent response start & streaming progress...`);

  // Step 1: Wait until a new assistant message starts receiving content (up to 30s)
  let hasStarted = false;
  const startTime = Date.now();
  const baseCount = initialMessageCount ?? 0;

  while (Date.now() - startTime < 30000) {
    const status = await page
      .evaluate(({ bCount, sel }) => {
        const msgs = document.querySelectorAll(sel);
        if (msgs.length === 0) return { started: false, len: 0 };
        // If initialMessageCount was given, ensure we are looking at a new message
        if (bCount > 0 && msgs.length <= bCount) {
          return { started: false, len: 0 };
        }
        // Scan back for the newest message that actually has text. Some pages
        // render an empty trailing node after the real reply -- reading the last
        // match blindly then sees "" forever and reports that the agent never
        // answered while the answer is on screen.
        let txt = '';
        for (let i = msgs.length - 1; i >= 0; i--) {
          const t = (msgs[i].textContent || '').trim();
          if (t) { txt = t; break; }
        }
        return { started: txt.length > 2, len: txt.length };
      }, { bCount: baseCount, sel: messageSelector })
      .catch(() => ({ started: false, len: 0 }));

    if (status.started) {
      hasStarted = true;
      break;
    }
    await sleep(300);
  }

  // Step 2: Stream completion detection — poll until text length stabilizes
  if (hasStarted) {
    console.log(`   🌊 AI agent is streaming response tokens...`);
    let previousText = '';
    let stableCount = 0;
    const streamStart = Date.now();

    while (Date.now() - streamStart < 45000) {
      const currentText = await page
        .evaluate((sel) => {
          const msgs = document.querySelectorAll(sel);
          if (msgs.length === 0) return '';
          for (let i = msgs.length - 1; i >= 0; i--) {
            const t = (msgs[i].textContent || '').trim();
            if (t) return `${msgs.length}:${t}`;
          }
          return '';
        }, messageSelector)
        .catch(() => '');

      // The count is part of the compared value, so a new message arriving
      // restarts the stability window instead of looking like "no change".
      if (currentText.length > 0 && currentText === previousText) {
        stableCount++;
        // If text is stable for 4 consecutive checks (1.6s), streaming has finished
        if (stableCount >= 4) {
          console.log(
            `   ✅ AI agent response completed (${currentText.length} characters).`,
          );
          break;
        }
      } else {
        stableCount = 0;
        previousText = currentText;
      }
      await sleep(400);
    }
  } else {
    // An agent that never answers is the failure this suite exists to catch.
    // Warning here and continuing is what let broken pages report [PASS].
    throw new Error(
      'Agent never produced a response within 30s -- no assistant message ever ' +
        'received content. Check the backend and the browser console output above.',
    );
  }

  // Step 3: Glide cursor smoothly to the finished response message
  const assistantLocator = page.locator(messageSelector).last();

  if (await assistantLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
    const abBox = await assistantLocator.boundingBox();
    if (abBox) {
      console.log(
        `   🎯 Focusing cursor on response at (${Math.round(abBox.x)}, ${Math.round(abBox.y)})`,
      );
      await humanGlide(
        page,
        abBox.x + Math.min(abBox.width / 2, 220),
        abBox.y + Math.min(abBox.height / 2, 60),
        20,
      );
    }
  } else {
    await humanGlide(page, 960, 500, 20);
  }

  // Step 4: Reading pause after response completes
  console.log(`   📖 Reading completed response (pausing ${postWaitMs / 1000}s)...`);
  await sleep(postWaitMs);
}

/** Default chat input across the CopilotKit prebuilt surfaces. */
const DEFAULT_INPUT_SELECTOR = SELECTORS.chatInput;

/** Default submit control; falls back to the Enter key when absent. */
const DEFAULT_SUBMIT_SELECTOR = SELECTORS.chatSubmit;

export interface SendPromptOptions {
  /** Override when a page hand-rolls its own input (headless UI, programmatic control). */
  inputSelector?: string;
  /** Override when submitting means clicking something other than a send button. */
  submitSelector?: string;
  /** Select-all + delete before typing, for inputs that arrive pre-populated. */
  clearFirst?: boolean;
  /** How long to wait for the input to appear. */
  timeoutMs?: number;
  /** Override when the page renders messages through a custom slot. */
  messageSelector?: string;
}

/**
 * Types a prompt into a demo page's chat input and submits it, the way a person
 * would -- glide, click, key-by-key typing, then the send button.
 *
 * Extracted because twelve action handlers had carried their own near-identical
 * copy of this, and only one of them had the swallowed-submit retry. Everything
 * routed through here now gets it.
 *
 * @returns The assistant message count observed *before* submitting. Pass it to
 *   waitForAgentResponseCompletion so multi-turn pages do not mistake the
 *   previous turn's reply for this one's.
 */
export async function sendPrompt(
  page: Page,
  prompt: string,
  options: SendPromptOptions = {},
): Promise<number> {
  const {
    inputSelector = DEFAULT_INPUT_SELECTOR,
    submitSelector = DEFAULT_SUBMIT_SELECTOR,
    clearFirst = false,
    timeoutMs = 15000,
    messageSelector = DEFAULT_ASSISTANT_MESSAGE_SELECTOR,
  } = options;

  const inputLocator = page.locator(inputSelector).first();
  await inputLocator.waitFor({ state: 'visible', timeout: timeoutMs });
  await sleep(300);

  const initialMsgCount = await getAssistantMessageCount(page, messageSelector);

  const inputBox = await inputLocator.boundingBox();
  if (inputBox) {
    await humanGlide(page, inputBox.x + 80, inputBox.y + inputBox.height / 2, 18);
    await humanClick(page);
  } else {
    await inputLocator.click();
  }
  await sleep(200);

  if (clearFirst) {
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
  }

  await page.keyboard.type(prompt, { delay: 35 });
  await sleep(300);

  // If a sudden React re-render wiped the text mid-typing, put it back.
  const currentVal = await inputLocator.inputValue().catch(() => '');
  if (!currentVal && prompt) {
    await inputLocator.fill(prompt);
    await sleep(200);
  }

  const submitBtn = page.locator(submitSelector).first();
  if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const btnBox = await submitBtn.boundingBox();
    if (btnBox) {
      await humanGlide(page, btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, 16);
      await humanClick(page);
    } else {
      await submitBtn.click();
    }
  } else {
    await page.keyboard.press('Enter');
  }

  // A swallowed submit leaves the text sitting in the box -- retry once.
  await sleep(800);
  const remainingVal = await inputLocator.inputValue().catch(() => '');
  if (remainingVal.trim().length > 0) {
    await page.keyboard.press('Enter');
  }

  return initialMsgCount;
}

/**
 * Prompts declared for a page, in order. Falls back to the single `prompt`
 * field for pages that only send one.
 */
export function promptsFor(config: PageRecordConfig): string[] {
  return config.prompts?.length ? config.prompts : [config.prompt];
}

export const runStandardAction: PageActionHandler = async (
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
};
