/**
 * Attachments — pick a real file, send it, and make the agent prove it read it.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 *
 * Three things this had to get right, because the earlier version got all three
 * wrong and the video showed it:
 *
 * 1. **The composer has no `input[type=file]` in the DOM.** It creates one on
 *    demand when the menu item is clicked, so writing a DataTransfer onto
 *    "the file input" silently attached nothing at all — which is why the agent
 *    had no idea what it was being asked about. The file now arrives through
 *    Playwright's `filechooser` interception: the same event the native dialog
 *    raises, so the upload path is the real one.
 *
 * 2. **The Windows dialog cannot be filmed.** It is an OS window outside the
 *    viewport and Playwright suppresses it, so a file appeared out of nowhere.
 *    `file-dialog.ts` draws one and the cursor picks the file in it; the dialog
 *    is a prop, the bytes are not.
 *
 * 3. **A 1x1 PNG proves nothing.** The fixture is now a legible chart rendered
 *    on a canvas, and the prompt asks for values only readable from the image —
 *    so a correct answer is evidence the file reached the model, and a wrong one
 *    is a real failure rather than something to squint at.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FileChooser, type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { closeFileDialog, openFileDialog, pickFileInDialog } from './file-dialog';

const FIXTURE_NAME = 'quarterly_revenue.png';

/**
 * Renders the fixture on a canvas in the page and returns its bytes.
 *
 * Drawn rather than committed so the repo carries no binary, and so the values
 * the prompt asks about live next to the code that draws them.
 */
async function renderFixture(page: Page, rootPath: string): Promise<Buffer> {
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

export const runAttachmentsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
  rootPath: string,
) => {
  const buffer = await renderFixture(page, rootPath);

  // Hold the intercepted chooser until the drawn dialog has been used, so the
  // file lands at the moment the cursor clicks Open rather than before it.
  let resolveChooser: ((fc: FileChooser) => void) | undefined;
  const chooserReady = new Promise<FileChooser>((resolve) => {
    resolveChooser = resolve;
  });
  page.once('filechooser', (fc) => resolveChooser?.(fc));

  // ── Open the composer's attachment menu ───────────────────────────────────
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

  // ── Pick the file, on camera ──────────────────────────────────────────────
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
  await sleep(1800);

  // ── Show the queued thumbnail before sending ──────────────────────────────
  const queue = page
    .locator('copilot-chat-attachment-queue, [data-testid="copilot-attachment-queue"]')
    .first();
  const queueBox = await queue.boundingBox().catch(() => null);
  if (queueBox) {
    console.log(`   🎯 Showing the queued attachment.`);
    await humanGlide(page, queueBox.x + queueBox.width / 2, queueBox.y + queueBox.height / 2, 22);
    await sleep(1400);
  } else {
    console.warn(`   ⚠️ nothing rendered in the attachment queue.`);
  }

  // The composer moves down once the queue appears, so the prompt is typed
  // after the attachment, never before.
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
};
