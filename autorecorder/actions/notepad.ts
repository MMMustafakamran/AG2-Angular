/**
 * A Windows 11 Notepad window, drawn over the page.
 *
 * Some pages in this repo are recorded as *findings* rather than as working
 * demos -- A2UI has no usable catalog in the guide, threads need a licence the
 * repo does not have, transcription is not configured. A video of a feature not
 * working explains nothing on its own; this is how the recording says what is
 * wrong, in writing, on screen, while the evidence is still visible behind it.
 *
 * Like `page-ready.ts`, this is framework-agnostic and **belongs in `core/`** --
 * it knows nothing about Angular, AG2 or CopilotKit, and every repo using this
 * suite has pages worth annotating. It lives in `actions/` only because `core/`
 * is frozen. Promote it when that changes.
 *
 * It clicks the taskbar's Notepad icon (`#win11-taskbar-notepad`, drawn by
 * core/overlays/taskbar.ts) before opening, so the window arrives the way a
 * person would open one.
 */
import { type Page } from 'playwright';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';

export interface NotepadPosition {
  top?: string;
  left?: string;
  right?: string;
  width?: string;
  height?: string;
  transform?: string;
}

/** Opens an authentic Windows 11 Notepad window overlay */
export async function openNotepadWindow(
  page: Page,
  title: string,
  pos?: NotepadPosition,
): Promise<void> {
  console.log(`📝 Opening Notepad: ${title}...`);
  await sleep(300);

  // Glide down to the taskbar's Notepad icon and click it. Resolved from the
  // element rather than hardcoded, because the taskbar centres its icon group
  // and the coordinates move with the viewport.
  const iconBox = await page
    .locator('#win11-taskbar-notepad')
    .boundingBox()
    .catch(() => null);
  if (iconBox) {
    await humanGlide(page, iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2, 22);
  } else {
    await humanGlide(page, 1038, 1055, 22);
  }
  await humanClick(page);
  await sleep(150);

  const top = pos?.top ?? '120px';
  const left = pos?.left ?? (pos?.right ? 'auto' : '50%');
  const right = pos?.right ?? 'auto';
  const width = pos?.width ?? '700px';
  const height = pos?.height ?? '460px';
  const transform =
    pos?.transform ?? (pos?.right ? 'none' : 'translateX(-50%) scale(0.96)');

  await page.evaluate(
    ({ titleStr, sTop, sLeft, sRight, sWidth, sHeight, sTransform }) => {
      const ind = document.getElementById('win11-notepad-indicator');
      if (ind) ind.style.background = '#60a5fa';

      const existing = document.getElementById('win11-notepad-overlay');
      if (existing) existing.remove();

      const np = document.createElement('div');
      np.id = 'win11-notepad-overlay';
      np.style.cssText = `position:fixed!important;top:${sTop}!important;left:${sLeft}!important;right:${sRight}!important;transform:${sTransform}!important;opacity:0!important;width:${sWidth}!important;height:${sHeight}!important;background:#202020!important;border:1px solid rgba(255,255,255,0.18)!important;border-radius:10px!important;box-shadow:0 24px 60px rgba(0,0,0,0.9),0 0 0 1px rgba(255,255,255,0.1)!important;z-index:2147483640!important;display:flex!important;flex-direction:column!important;font-family:Segoe UI,sans-serif!important;overflow:hidden!important;transition:all 0.35s cubic-bezier(0.16,1,0.3,1)!important;`;

      np.innerHTML = [
        '<div style="height:38px;background:#2b2b2b;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid rgba(255,255,255,0.08);user-select:none;">',
        '  <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#e5e5e5;font-weight:500;">',
        '    <svg width="16" height="16" viewBox="0 0 24 24" fill="#60a5fa"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
        '    <span>' + titleStr + ' - Notepad</span>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:12px;color:#a3a3a3;font-size:11px;">',
        '    <span>&#x2500;</span><span>&#x25A1;</span><span id="win11-notepad-close-btn" style="color:#ef4444;font-size:13px;font-weight:bold;cursor:pointer;">&#x2715;</span>',
        '  </div>',
        '</div>',
        '<div style="height:26px;background:#202020;display:flex;align-items:center;gap:16px;padding:0 14px;font-size:11px;color:#a3a3a3;border-bottom:1px solid rgba(255,255,255,0.06);user-select:none;">',
        '  <span>File</span><span>Edit</span><span>View</span>',
        '</div>',
        '<div id="notepad-content-body" style="flex:1;padding:16px;background:#1e1e1e;color:#f3f3f3;font-family:Consolas,Courier New,monospace;font-size:13.5px;line-height:1.65;white-space:pre-wrap;overflow-y:auto;"></div>',
      ].join('');

      document.documentElement.appendChild(np);

      setTimeout(() => {
        np.style.opacity = '1';
        if (sRight !== 'auto') {
          np.style.transform = 'none';
        } else {
          np.style.transform = 'translateX(-50%) scale(1)';
        }
      }, 30);
    },
    {
      titleStr: title,
      sTop: top,
      sLeft: left,
      sRight: right,
      sWidth: width,
      sHeight: height,
      sTransform: transform,
    },
  );

  await sleep(400);
}

/** Types new lines of text into the active Notepad body with rapid hurried keystroke rhythm */
export async function typeInNotepad(
  page: Page,
  newLines: string[],
  focusX = 1560,
  focusY = 320,
): Promise<void> {
  // Move cursor into Notepad body and click to focus
  await humanGlide(page, focusX, focusY, 18);
  await humanClick(page);
  await sleep(200);

  const textToAdd = newLines.join('\n');

  for (let i = 0; i < textToAdd.length; i++) {
    const char = textToAdd[i];

    await page.evaluate(
      ({ nextChar }) => {
        const el = document.getElementById('notepad-content-body');
        if (el) {
          if (el.textContent?.endsWith(' |')) {
            el.textContent = el.textContent.slice(0, -2) + nextChar + ' |';
          } else {
            el.textContent = (el.textContent || '') + nextChar + ' |';
          }
          el.scrollTop = el.scrollHeight;
        }
      },
      { nextChar: char },
    );

    // Rapid hurried typing rhythm: 25-50ms with occasional burst
    let delay = 25 + Math.floor(Math.random() * 25);
    if (char === '\n') delay = 160 + Math.floor(Math.random() * 60);
    else if (char === '.' || char === ':' || char === '-') delay = 90 + Math.floor(Math.random() * 40);
    else if (char === ' ') delay = 35 + Math.floor(Math.random() * 15);

    await sleep(delay);
  }

  // Remove trailing caret
  await page.evaluate(() => {
    const el = document.getElementById('notepad-content-body');
    if (el && el.textContent?.endsWith(' |')) {
      el.textContent = el.textContent.slice(0, -2);
    }
  });

  await sleep(250);
}

/** Standard full-cycle note (open, type all in a hurry, wait, close) */
export async function showNotepadNote(
  page: Page,
  title: string,
  textLines: string[],
): Promise<void> {
  await openNotepadWindow(page, title);
  await typeInNotepad(page, textLines, 960, 240);
  await sleep(4000);
}

/** Smoothly closes the Notepad overlay and dims the taskbar indicator */
export async function closeNotepadNote(page: Page): Promise<void> {
  console.log(`📝 Closing Notepad overlay...`);
  await page.evaluate(() => {
    const ind = document.getElementById('win11-notepad-indicator');
    if (ind) ind.style.background = 'transparent';

    const np = document.getElementById('win11-notepad-overlay');
    if (np) {
      np.style.opacity = '0';
      np.style.transform = 'scale(0.96)';
      setTimeout(() => {
        np.remove();
      }, 300);
    }
  });
  await sleep(350);
}
