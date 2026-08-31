/**
 * A Windows 11 "Open" file dialog, drawn over the page.
 *
 * The real one is an OS window: it lives outside the browser viewport, Playwright
 * intercepts it before it is ever shown, and a captured video therefore cannot
 * contain it. Without something in its place, a file appears in the composer out
 * of nowhere and the recording looks faked — which is exactly the complaint this
 * exists to answer.
 *
 * So the picking is drawn here, and the *file itself* is delivered through
 * Playwright's `filechooser` interception, which is the same event the real
 * dialog raises. The bytes, the upload, the queue and the agent's reading of the
 * file are all genuine; only the window is a prop.
 *
 * Like `notepad.ts` and `page-ready.ts` this is framework-agnostic and **belongs
 * in `core/`**; it lives in `actions/` only because `core/` is frozen.
 */
import { type Page } from 'playwright';

import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';

export interface DialogFile {
  /** File name shown in the list. */
  name: string;
  /** Right-hand column, e.g. "PNG image". */
  kind: string;
  /** Size column, e.g. "21 KB". */
  size: string;
}

const DIALOG_ID = 'sim-file-dialog';

/** Opens the dialog listing `files`, with `files[0]` as the one to be picked. */
export async function openFileDialog(page: Page, files: DialogFile[]): Promise<void> {
  await page.evaluate(
    ({ id, items }) => {
      const rows = items
        .map(
          (f, i) =>
            '<div id="' + id + '-row-' + i + '" style="display:grid;grid-template-columns:1fr 140px 90px;gap:8px;padding:7px 12px;border-radius:4px;font-size:13px;color:#1f1f1f;' +
            (i === 0 ? 'background:#cce4f7;' : '') +
            '">' +
            '<span style="display:flex;align-items:center;gap:8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="#1a73e8"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>' +
            f.name +
            '</span>' +
            '<span style="color:#5f5f5f;">' + f.kind + '</span>' +
            '<span style="color:#5f5f5f;text-align:right;">' + f.size + '</span>' +
            '</div>',
        )
        .join('');

      const el = document.createElement('div');
      el.id = id;
      el.style.cssText =
        'position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-48%) scale(0.98)!important;' +
        'width:820px!important;height:520px!important;background:#f3f3f3!important;border-radius:10px!important;' +
        'box-shadow:0 32px 80px rgba(0,0,0,0.55),0 0 0 1px rgba(0,0,0,0.12)!important;z-index:2147483643!important;' +
        'font-family:"Segoe UI",system-ui,sans-serif!important;display:flex!important;flex-direction:column!important;' +
        'overflow:hidden!important;opacity:0!important;transition:opacity .2s ease,transform .2s ease!important;';

      el.innerHTML = [
        '<div style="height:40px;background:#e9e9e9;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid rgba(0,0,0,0.08);">',
        '  <span style="font-size:13px;font-weight:600;color:#1f1f1f;">Open</span>',
        '  <span style="color:#5f5f5f;font-size:12px;">&#x2715;</span>',
        '</div>',
        '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(0,0,0,0.06);font-size:12px;color:#3f3f3f;">',
        '  <span>&#x2190;</span><span>&#x2192;</span><span>&#x2191;</span>',
        '  <div style="flex:1;background:#fff;border:1px solid #d6d6d6;border-radius:4px;padding:5px 10px;">This PC &rsaquo; Pictures &rsaquo; samples</div>',
        '</div>',
        '<div style="flex:1;display:flex;min-height:0;">',
        '  <div style="width:190px;background:#fafafa;border-right:1px solid rgba(0,0,0,0.06);padding:12px 10px;font-size:12.5px;color:#3f3f3f;line-height:2.1;">',
        '    <div>&#x1F4C1; Desktop</div><div>&#x1F4C1; Documents</div><div style="font-weight:600;">&#x1F4C1; Pictures</div><div>&#x1F4C1; Downloads</div>',
        '  </div>',
        '  <div style="flex:1;background:#fff;padding:10px 8px;overflow:auto;">',
        '    <div style="display:grid;grid-template-columns:1fr 140px 90px;gap:8px;padding:4px 12px;font-size:11.5px;color:#767676;border-bottom:1px solid rgba(0,0,0,0.06);margin-bottom:6px;">',
        '      <span>Name</span><span>Type</span><span style="text-align:right;">Size</span>',
        '    </div>',
        rows,
        '  </div>',
        '</div>',
        '<div style="height:64px;background:#f3f3f3;border-top:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 16px;">',
        '  <div style="flex:1;display:flex;align-items:center;gap:10px;font-size:12.5px;color:#3f3f3f;">',
        '    <span>File name:</span>',
        '    <div id="' + id + '-filename" style="flex:1;max-width:380px;background:#fff;border:1px solid #d6d6d6;border-radius:4px;padding:6px 10px;">' + (items[0]?.name ?? '') + '</div>',
        '  </div>',
        '  <button id="' + id + '-open" style="background:#0067c0;color:#fff;border:none;border-radius:4px;padding:8px 22px;font-size:13px;font-weight:500;">Open</button>',
        '  <button style="background:#fdfdfd;color:#1f1f1f;border:1px solid #d6d6d6;border-radius:4px;padding:8px 18px;font-size:13px;">Cancel</button>',
        '</div>',
      ].join('');

      document.documentElement.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%,-50%) scale(1)';
      }, 30);
    },
    { id: DIALOG_ID, items: files },
  );
  await sleep(600);
}

/** Clicks the first row, then Open — the visible half of picking a file. */
export async function pickFileInDialog(page: Page): Promise<void> {
  for (const selector of [`#${DIALOG_ID}-row-0`, `#${DIALOG_ID}-open`]) {
    const el = page.locator(selector);
    const box = await el.boundingBox().catch(() => null);
    if (!box) continue;
    await humanGlide(page, box.x + Math.min(box.width / 2, 200), box.y + box.height / 2, 22);
    await sleep(450);
    await humanClick(page);
    await sleep(500);
  }
}

export async function closeFileDialog(page: Page): Promise<void> {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%,-48%) scale(0.98)';
    setTimeout(() => el.remove(), 220);
  }, DIALOG_ID);
  await sleep(300);
}
