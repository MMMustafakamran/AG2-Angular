/**
 * Puts errors on screen, so a page whose failure *is* the story can be recorded honestly.
 *
 * `openNextJsErrorOverlay`: renders a single, pixel-perfect Next.js 16 Dev Error Overlay:
 * 1. Displays the bottom-left red "N 1 Issue ✕" toast badge (above the taskbar).
 * 2. Glides the virtual cursor to the toast badge and clicks it.
 * 3. Expands the sleek dark Next.js Dev Error modal (< 1/1 >, Turbopack badge, Console Error chip,
 *    red error message, and Call Stack count).
 * 4. Glides the cursor to the error message for comfortable reading.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page } from 'playwright';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/**
 * The version badge in the overlay, read from the Next.js actually installed in
 * `frontend/`. It used to be a hardcoded string, which meant every recorded
 * error was stamped with whichever version was current when someone last edited
 * this file.
 */
function nextVersionText(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'frontend', 'node_modules', 'next', 'package.json'), 'utf8'),
    ) as { version?: string };
    if (pkg.version) return `Next.js ${pkg.version} Turbopack`;
  } catch {
    // Not installed, or a layout this does not know about.
  }
  return 'Next.js Turbopack';
}

/** One thing the browser complained about. */
export interface CapturedError {
  kind: 'console' | 'pageerror' | 'request';
  text: string;
}

export interface ErrorCollector {
  /** Everything captured so far, newest last, de-duplicated. */
  entries: () => CapturedError[];
  /** Stop listening. Safe to call more than once. */
  stop: () => void;
}

/**
 * Noise every dev server produces, which would bury the real error.
 */
const IGNORED = [
  'favicon.ico',
  'reo.dev',
  'analytics',
  'webpack-hmr',
  '.map',
  'Hydration failed',
  "server rendered text didn't match",
  'Minified React error',
  'Download the React DevTools',
  'Lit is in dev mode',
  'Failed to load resource',
];

const isNoise = (text: string): boolean =>
  !text.trim() || IGNORED.some((n) => text.includes(n));

/**
 * Starts listening for browser-reported failures.
 */
export function captureErrors(page: Page): ErrorCollector {
  const seen = new Set<string>();
  const found: CapturedError[] = [];

  const add = (kind: CapturedError['kind'], text: string): void => {
    const trimmed = text.trim();
    if (isNoise(trimmed) || seen.has(trimmed)) return;
    seen.add(trimmed);
    found.push({ kind, text: trimmed });
  };

  const onConsole = (msg: { type: () => string; text: () => string }): void => {
    if (msg.type() === 'error') add('console', msg.text());
  };
  const onPageError = (err: Error): void => add('pageerror', err.message || String(err));
  const onRequestFailed = (req: {
    method: () => string;
    url: () => string;
    failure: () => { errorText: string } | null;
  }): void =>
    add('request', `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'failed'}`);

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);

  let stopped = false;
  return {
    entries: () => [...found],
    stop: () => {
      if (stopped) return;
      stopped = true;
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
    },
  };
}

export interface NextJsErrorOverlayOptions {
  /** Explicit error message string (defaults to captured error text) */
  message?: string;
  /** Badge text in red chip, e.g. "Console Error", "Runtime Error" */
  errorType?: string;
  /** Version tag on the right; defaults to the Next.js installed in `frontend/`. */
  versionText?: string;
  /** Frame count shown in Call Stack pill, defaults to 4 */
  callStackFrames?: number;
  /** Animate the virtual cursor clicking the bottom-left toast before opening */
  animateToastClick?: boolean;
  /** Reading pause duration in milliseconds after opening the overlay */
  waitMs?: number;
}

/**
 * Opens the Next.js Dev Error Overlay window on screen.
 *
 * Guarantees strictly ONE error overlay is rendered and displayed.
 */
export async function openNextJsErrorOverlay(
  page: Page,
  errors: CapturedError[] = [],
  opts: NextJsErrorOverlayOptions = {},
): Promise<void> {
  const {
    message,
    errorType = 'Console Error',
    versionText = nextVersionText(),
    callStackFrames = 4,
    animateToastClick = true,
    waitMs = 5000,
  } = opts;

  // Clean up any existing native Next.js portal or prior overlays to prevent duplicates
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, #__autorecord_nextjs_toast, #__autorecord_nextjs_overlay, #__autorecord_error_console').forEach((el) => {
      el.remove();
    });
  }).catch(() => {});

  // No caller-supplied message and nothing captured means there is no error to
  // show. Rendering one anyway would put a defect on screen that the run did
  // not produce -- for a long time this fell back to a hardcoded
  // "Frontend tool resume requires a database", which outlived the bug it
  // described and kept two fixed pages looking broken.
  const errorText = message || errors[0]?.text;
  if (!errorText) {
    console.warn('   ⚠️ No error captured or specified — skipping the overlay.');
    return;
  }

  const issueCount = Math.max(1, errors.length);

  // 1. Render Next.js bottom-left Issue toast
  await page.evaluate(
    ({ count }) => {
      const toast = document.createElement('div');
      toast.id = '__autorecord_nextjs_toast';
      toast.style.cssText = [
        'position: fixed',
        'bottom: 64px',
        'left: 24px',
        'z-index: 2147483646',
        'display: flex',
        'align-items: center',
        'gap: 8px',
        'background: #dc2626',
        'color: #ffffff',
        'border-radius: 9999px',
        'padding: 5px 12px 5px 6px',
        'box-shadow: 0 4px 16px rgba(220, 38, 38, 0.45)',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size: 13px',
        'font-weight: 600',
        'cursor: pointer',
        'user-select: none',
        'opacity: 0',
        'transform: translateY(12px)',
        'transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      ].join(';');

      const circle = document.createElement('div');
      circle.style.cssText = [
        'width: 22px',
        'height: 22px',
        'border-radius: 50%',
        'background: #ffffff',
        'color: #dc2626',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'font-weight: 800',
        'font-size: 11px',
        'flex: 0 0 auto',
      ].join(';');
      circle.textContent = 'N';

      const label = document.createElement('span');
      label.textContent = `${count} Issue${count > 1 ? 's' : ''}`;

      const close = document.createElement('span');
      close.style.cssText = 'opacity: 0.85; font-size: 11px; margin-left: 2px;';
      close.textContent = '✕';

      toast.appendChild(circle);
      toast.appendChild(label);
      toast.appendChild(close);
      document.documentElement.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });
    },
    { count: issueCount },
  );

  await sleep(400);

  // 2. Animate virtual cursor to click the toast
  if (animateToastClick) {
    const toastPos = (await page.evaluate(() => {
      const el = document.getElementById('__autorecord_nextjs_toast');
      if (!el) return { x: 75, y: 1000 };
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })) as { x: number; y: number };

    await humanGlide(page, toastPos.x, toastPos.y, 22);
    await sleep(200);
    await humanClick(page);
    await sleep(150);
  }

  // 3. Render Next.js Error Overlay modal
  await page.evaluate(
    ({ errText, errType, verText, frames, count }) => {
      document.getElementById('__autorecord_nextjs_overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.id = '__autorecord_nextjs_overlay';
      overlay.style.cssText = [
        'position: fixed',
        'top: 48px',
        'left: 50%',
        'transform: translateX(-50%) scale(0.95)',
        'width: 820px',
        'max-width: calc(100vw - 48px)',
        'z-index: 2147483647',
        'background: #111111',
        'border: 1px solid #27272a',
        'border-radius: 14px',
        'box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'color: #ededed',
        'overflow: hidden',
        'opacity: 0',
        'transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
      ].join(';');

      // Header
      const header = document.createElement('div');
      header.style.cssText = [
        'display: flex',
        'align-items: center',
        'justify-content: space-between',
        'padding: 12px 20px',
        'border-bottom: 1px solid #222225',
        'background: #151517',
      ].join(';');

      const nav = document.createElement('div');
      nav.style.cssText = 'display: flex; align-items: center; gap: 8px; color: #71717a; font-size: 13px; font-weight: 500;';
      nav.innerHTML = `<span style="cursor: pointer; opacity: 0.6;">‹</span> <span style="color: #ededed;">1/${count}</span> <span style="cursor: pointer; opacity: 0.6;">›</span>`;

      const verBadge = document.createElement('div');
      verBadge.style.cssText = [
        'display: flex',
        'align-items: center',
        'gap: 7px',
        'background: #202024',
        'border: 1px solid #2e2e33',
        'border-radius: 9999px',
        'padding: 4px 12px',
        'font-size: 12px',
        'color: #d4d4d8',
      ].join(';');

      const isTurbopack = verText.includes('Turbopack');
      const baseVer = isTurbopack ? verText.replace('Turbopack', '').trim() : verText;

      verBadge.innerHTML = `
        <span style="width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e;"></span>
        <span>${baseVer}</span>
        ${isTurbopack ? '<span style="color: #ec4899; font-weight: 600; margin-left: 2px;">Turbopack</span>' : ''}
      `;

      header.appendChild(nav);
      header.appendChild(verBadge);
      overlay.appendChild(header);

      // Body
      const body = document.createElement('div');
      body.style.cssText = 'padding: 22px 24px;';

      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';

      const typeChip = document.createElement('div');
      typeChip.style.cssText = [
        'background: #3f1212',
        'color: #ef4444',
        'border: 1px solid #7f1d1d',
        'font-size: 12px',
        'font-weight: 600',
        'padding: 3px 9px',
        'border-radius: 6px',
        'display: inline-block',
      ].join(';');
      typeChip.textContent = errType;

      const icons = document.createElement('div');
      icons.style.cssText = 'display: flex; align-items: center; gap: 14px; color: #71717a;';
      icons.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor: pointer;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor: pointer;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor: pointer;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      `;

      actionRow.appendChild(typeChip);
      actionRow.appendChild(icons);
      body.appendChild(actionRow);

      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = [
        'margin-top: 14px',
        'color: #ef4444',
        'font-size: 16px',
        'font-weight: 600',
        'line-height: 1.45',
        'word-break: break-word',
      ].join(';');
      errorMsg.textContent = errText;
      body.appendChild(errorMsg);

      const callStack = document.createElement('div');
      callStack.style.cssText = [
        'margin-top: 28px',
        'padding-top: 16px',
        'border-top: 1px solid #222225',
        'display: flex',
        'align-items: center',
        'justify-content: space-between',
      ].join(';');

      const stackLeft = document.createElement('div');
      stackLeft.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #ededed;';
      stackLeft.innerHTML = `
        <span>Call Stack</span>
        <span style="background: #27272a; color: #a1a1aa; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px;">${frames}</span>
      `;

      const stackRight = document.createElement('div');
      stackRight.style.cssText = 'display: flex; align-items: center; gap: 6px; color: #a1a1aa; font-size: 13px; cursor: pointer;';
      stackRight.innerHTML = `
        <span>Show ${frames} ignore-listed frame(s)</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
      `;

      callStack.appendChild(stackLeft);
      callStack.appendChild(stackRight);
      body.appendChild(callStack);

      overlay.appendChild(body);
      document.documentElement.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.style.transform = 'translateX(-50%) scale(1)';
      });
    },
    {
      errText: errorText,
      errType: errorType,
      verText: versionText,
      frames: callStackFrames,
      count: issueCount,
    },
  );

  // Glide virtual cursor up to the error window
  await sleep(400);
  await humanGlide(page, 960, 180, 22);

  // Reading pause
  await sleep(waitMs);
}

export interface ErrorConsoleOptions {
  /** Sits in the console's own message area, above the errors. */
  note?: string;
  /** Longest an entry may run before it is cut, so one stack trace cannot fill the frame. */
  maxChars?: number;
  /** Most entries to show. */
  maxEntries?: number;
  /** Move the virtual cursor down to the panel as it opens. */
  moveCursor?: boolean;
}

/**
 * Opens a console at the bottom of the page and shows the captured errors in it.
 */
export async function openDevToolsConsole(
  page: Page,
  errors: CapturedError[],
  opts: ErrorConsoleOptions = {},
): Promise<void> {
  const { note = '', maxChars = 300, maxEntries = 6, moveCursor = true } = opts;

  if (errors.length === 0) return;

  const rows = errors.slice(-maxEntries).map((e) => ({
    kind: e.kind,
    text: e.text.length > maxChars ? `${e.text.slice(0, maxChars)}…` : e.text,
  }));

  if (moveCursor) {
    const viewport = page.viewportSize();
    const y = viewport ? viewport.height - 150 : 900;
    await humanGlide(page, 240, y, 22);
    await humanClick(page);
    await sleep(250);
  }

  await page.evaluate(
    ({ rows: entries, note: subtitle }) => {
      document.getElementById('__autorecord_error_console')?.remove();

      const TABS = ['Elements', 'Console', 'Sources', 'Network', 'Performance'];
      const panel = document.createElement('div');
      panel.id = '__autorecord_error_console';
      panel.style.cssText = [
        'position:fixed',
        'left:0',
        'right:0',
        'bottom:48px',
        'z-index:2147483646',
        'height:0px',
        'overflow:hidden',
        'background:#282828',
        'border-top:1px solid #4a4a4a',
        'box-shadow:0 -12px 32px rgba(0,0,0,.45)',
        'font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace',
        'color:#e8eaed',
        'transition:height .32s cubic-bezier(.2,.7,.3,1)',
      ].join(';');

      const tabs = document.createElement('div');
      tabs.style.cssText =
        'display:flex;align-items:center;gap:2px;padding:0 8px;background:#333;border-bottom:1px solid #4a4a4a;height:30px;flex:0 0 auto;';
      for (const name of TABS) {
        const tab = document.createElement('div');
        const active = name === 'Console';
        tab.style.cssText = `padding:6px 11px;font-size:12px;color:${
          active ? '#e8eaed' : '#9aa0a6'
        };${
          active ? 'background:#282828;border-bottom:2px solid #8ab4f8;' : ''
        }`;
        tab.textContent = name;
        tabs.appendChild(tab);
      }
      const count = document.createElement('div');
      count.style.cssText =
        'margin-left:auto;display:flex;align-items:center;gap:6px;color:#f28b82;font-size:12px;';
      count.textContent = `⊘ ${entries.length}`;
      tabs.appendChild(count);
      panel.appendChild(tabs);

      const filter = document.createElement('div');
      filter.style.cssText =
        'display:flex;align-items:center;gap:10px;padding:5px 10px;background:#282828;border-bottom:1px solid #3c3c3c;color:#9aa0a6;font-size:11px;flex:0 0 auto;';
      filter.textContent = 'top ▾   Filter   Errors only';
      panel.appendChild(filter);

      const body = document.createElement('div');
      body.style.cssText = 'overflow-y:auto;';

      if (subtitle) {
        const sub = document.createElement('div');
        sub.style.cssText =
          'padding:7px 12px;color:#9aa0a6;border-bottom:1px solid #3c3c3c;font-style:italic;';
        sub.textContent = subtitle;
        body.appendChild(sub);
      }

      for (const entry of entries) {
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex;gap:8px;padding:6px 12px;border-bottom:1px solid #3c3c3c;background:#2d1b1b;color:#f28b82;white-space:pre-wrap;word-break:break-word;';
        const icon = document.createElement('span');
        icon.style.cssText = 'flex:0 0 auto;color:#f28b82;';
        icon.textContent = '✖';
        row.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = entry.text;
        row.appendChild(text);
        body.appendChild(row);
      }
      panel.appendChild(body);

      document.documentElement.appendChild(panel);

      const needed = tabs.offsetHeight + filter.offsetHeight + body.scrollHeight;
      const target = Math.min(Math.max(needed, 120), Math.round(innerHeight * 0.42));
      body.style.maxHeight = `${target - tabs.offsetHeight - filter.offsetHeight}px`;

      requestAnimationFrame(() => {
        panel.style.height = `${target}px`;
      });
    },
    { rows, note },
  );

  await sleep(700);
}
