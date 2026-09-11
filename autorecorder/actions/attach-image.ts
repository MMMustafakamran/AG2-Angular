/**
 * Attach a real image to the composer, on camera.
 *
 * Two pages need this — Attachments, and Voice & multimodal, where the working
 * image path is the control that proves the broken microphone is not a broken
 * page. Sharing it means the same evidence is produced the same way in both,
 * and the three things this had to get right stay fixed in one place:
 *
 * 1. **The composer has no `input[type=file]` in the DOM.** It creates one on
 *    demand when the menu item is clicked, so writing a DataTransfer onto "the
 *    file input" silently attaches nothing at all — and the agent then answers
 *    about an image it never received. The file arrives through Playwright's
 *    `filechooser` interception instead: the same event the native dialog
 *    raises, so the upload path is the real one.
 *
 * 2. **The Windows dialog cannot be filmed.** It is an OS window outside the
 *    viewport and Playwright suppresses it, so a file appeared out of nowhere.
 *    `file-dialog.ts` draws one and the cursor picks the file in it; the dialog
 *    is a prop, the bytes are not.
 *
 * 3. **A 1x1 PNG proves nothing.** The fixture is a legible chart drawn on a
 *    canvas, and the prompts that use it ask for values only readable from the
 *    image — so a correct answer is evidence the file reached the model, and a
 *    wrong one is a real failure rather than something to squint at.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FileChooser, type Page } from 'playwright';

import { beat, humanClick, humanGlide, sleep } from '../core/overlays/cursor';

import { closeFileDialog, openFileDialog, pickFileInDialog } from './file-dialog';

export const FIXTURE_NAME = 'quarterly_revenue.png';

/**
 * The values the chart carries, and therefore the only correct answers to the
 * prompts that ask about it. Kept beside the drawing code so a change to one is
 * a change to the other.
 */
export const FIXTURE_FACTS = {
  title: 'Quarterly revenue',
  values: [120, 180, 240, 300],
} as const;

/**
 * Renders the fixture on a canvas in the page and returns its bytes.
 *
 * Drawn rather than committed so the repo carries no binary, and so the values
 * the prompt asks about live next to the code that draws them.
 */
export async function renderFixture(page: Page, rootPath: string): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = '#111827';
    g.font = 'bold 30px sans-serif';
    g.fillText('Quarterly revenue', 30, 52);

    const values = [120, 180, 240, 300];
    values.forEach((v, i) => {
      g.fillStyle = '#2563eb';
      g.fillRect(40 + i * 150, 380 - v, 100, v);
      g.fillStyle = '#111827';
      g.font = '20px sans-serif';
      g.fillText(`Q${i + 1} ${v}`, 44 + i * 150, 372 - v);
    });
    return canvas.toDataURL('image/png');
  });

  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');

  // Also written to disk so the fixture can be opened and checked by hand.
  const dir = join(rootPath, 'autorecorder', 'assets');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, FIXTURE_NAME), buffer);

  return buffer;
}

/**
 * Drives the whole attach flow: draw the fixture, open the composer's menu,
 * pick the file in the simulated dialog, hand the real bytes to the intercepted
 * chooser, and rest on the queued thumbnail.
 *
 * Throws rather than warning. A silent no-op here produces the worst possible
 * clip — the agent answers plausibly about an image it never got, and the video
 * documents a working feature that is not working.
 */
export async function attachImage(page: Page, rootPath: string): Promise<Buffer> {
  const buffer = await renderFixture(page, rootPath);

  // Hold the intercepted chooser until the drawn dialog has been used, so the
  // file lands at the moment the cursor clicks Open rather than before it.
  let resolveChooser: ((fc: FileChooser) => void) | undefined;
  const chooserReady = new Promise<FileChooser>((resolve) => {
    resolveChooser = resolve;
  });
  page.once('filechooser', (fc) => resolveChooser?.(fc));

  const addBtn = page
    .locator('button[aria-label*="Add photos or files" i], .cdk-menu-trigger')
    .first();
  const addBox = await addBtn
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => addBtn.boundingBox())
    .catch(() => null);

  if (!addBox) {
    throw new Error('Attachment control not found — the composer has no attachments menu.');
  }

  console.log(`   📎 Opening the attachment menu...`);
  await humanGlide(page, addBox.x + addBox.width / 2, addBox.y + addBox.height / 2, 22);
  await sleep(350);
  await humanClick(page);
  await sleep(700);

  // The menu item carries a tooltip that sits on top of it and swallows real
  // clicks, so this one is dispatched rather than aimed.
  const menuItem = page.locator('[role="menuitem"], .cdk-menu-item').first();
  const itemBox = await menuItem.boundingBox().catch(() => null);
  if (itemBox) {
    await humanGlide(page, itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2, 20);
    await sleep(400);
  }
  await menuItem.click({ force: true });

  await openFileDialog(page, [
    { name: FIXTURE_NAME, kind: 'PNG image', size: `${Math.round(buffer.length / 1024)} KB` },
    { name: 'team_offsite.jpg', kind: 'JPG image', size: '184 KB' },
    { name: 'invoice_2026_08.pdf', kind: 'PDF document', size: '96 KB' },
  ]);
  await pickFileInDialog(page);
  await closeFileDialog(page);

  const chooser = await Promise.race([
    chooserReady,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  if (!chooser) {
    throw new Error(
      'No file chooser was raised — the attachment menu did not open a picker, ' +
        'so nothing could be attached.',
    );
  }

  await chooser.setFiles({ name: FIXTURE_NAME, mimeType: 'image/png', buffer });
  console.log(`   📁 ${FIXTURE_NAME} attached (${buffer.length} bytes).`);
  await beat(1800);

  const queue = page
    .locator('copilot-chat-attachment-queue, [data-testid="copilot-attachment-queue"]')
    .first();
  const queueBox = await queue.boundingBox().catch(() => null);
  if (queueBox) {
    console.log(`   🎯 Showing the queued attachment.`);
    await humanGlide(page, queueBox.x + queueBox.width / 2, queueBox.y + queueBox.height / 2, 22);
    await beat(1400);
  } else {
    console.warn(`   ⚠️ nothing rendered in the attachment queue.`);
  }

  return buffer;
}
