import { type Locator, type Page } from 'playwright';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { describe, tracked } from '../core/timeline';

/**
 * Glide the on-screen cursor to an element and click it, the way the other
 * handlers do by hand. Falls back to a plain click when the element has no box
 * yet (mid-layout), so a take never stalls on the cursor overlay.
 */
export async function glideClick(page: Page, target: Locator): Promise<void> {
  // Logged to events.jsonl (ok, or the error) and rethrown unchanged.
  await tracked('click', describe(target), async () => {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const box = await target.boundingBox();
    if (box) {
      await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
      await humanClick(page);
    } else {
      await target.click();
    }
  });
}

/** Rest the cursor on an element so the viewer's eye lands there. */
export async function glideTo(page: Page, target: Locator, pauseMs = 1500): Promise<void> {
  const box = await target.boundingBox().catch(() => null);
  if (box) await humanGlide(page, box.x + Math.min(box.width / 2, 240), box.y + box.height / 2, 25);
  await sleep(pauseMs);
}

/**
 * Poll an element's text until `test` passes or the time runs out. Returns the
 * last text seen either way, so the caller decides what a miss means.
 */
export async function waitForText(
  target: Locator,
  test: (text: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = ((await target.textContent({ timeout: 1000 }).catch(() => '')) ?? '').trim();
    if (test(last)) return last;
    await sleep(500);
  }
  return last;
}

/**
 * Whether an element becomes visible within the time given. Not
 * `locator.isVisible({ timeout })`: Playwright ignores that timeout and answers
 * immediately, so a card still rendering would read as "never rendered".
 */
export async function visibleWithin(target: Locator, timeoutMs: number): Promise<boolean> {
  return target
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}
