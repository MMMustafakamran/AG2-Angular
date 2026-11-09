import { type Locator, type Page } from 'playwright';
import { type PageRecordConfig } from '../core/types';
import { getGlobalCursorPos, humanClick, humanGlide, idleNudge, sleep } from '../core/overlays/cursor';
import { closeNotepad, openNotepad, typeInNotepad } from '../core/overlays/notepad';
import { clickTaskbarApp, ensureOverlays, waitForHydration } from '../core/overlays/taskbar';
import { checkpoint, mark, probeText } from '../core/timeline';

import { humanizeNote } from '../core/overlays/note-style';
/**
 * Human-style doc evidence, ported from LangGraph-react/autorecorder/actions/langgraph.actions.ts
 * (REPOS.md Rule 6). The clip goes back to the doc, mouse-wheels to each cited text, drag-selects
 * it with the browser's own selection and pauses. Nothing is drawn on the page; the explanation
 * goes in Notepad. `caption` is only printed to the recorder log.
 */
export interface DocEvidence {
  /** Text inside the element to point at (matched against pre/code/p/li/h2/h3). */
  text: string;
  /** Recorder-log note for this spot (not shown in the video). */
  caption: string;
  /** Tab to click first when the text sits behind one (e.g. the doc's "Code" tab). */
  clickTab?: string;
}

export const TYPING = { charDelayMs: 34, jitter: 0.65, thinkChance: 0.05 };

async function findEvidence(page: Page, text: string, inTab = false) {
  // Behind a tab: only look inside the open tab panel, so a copy further down isn't picked instead.
  const scope = inTab ? page.locator('[role="tabpanel"][data-state="active"], [role="tabpanel"]:not([hidden])') : null;
  for (const sel of ['pre', 'code', 'p', 'li', 'h2', 'h3']) {
    const all = scope ? scope.locator(sel, { hasText: text }) : page.locator(sel, { hasText: text });
    const n = await all.count();
    for (let i = 0; i < n; i++) {
      if (await all.nth(i).isVisible().catch(() => false)) return all.nth(i);
    }
  }
  const any = page.getByText(text, { exact: false }).first();
  if ((await any.count()) > 0 && (await any.isVisible().catch(() => false))) return any;
  return null;
}

/** Go back to the doc page and highlight each cited text, one by one. */
export async function showDocEvidence(page: Page, config: PageRecordConfig, items: DocEvidence[] | undefined): Promise<void> {
  if (!items?.length) return;
  console.log(`   🔎 Showing the finding on the doc page (${items.length} spot(s))...`);
  await clickTaskbarApp(page, 'chrome').catch(() => {});
  // docs.copilotkit.ai throws its own hydration error (#418) on some pages; the demo verdict is
  // settled, so the take's error collectors are detached before the doc revisit (FINDINGS.md #48).
  page.removeAllListeners('pageerror');
  page.removeAllListeners('console');
  await page.goto(config.docUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await ensureOverlays(page, 'chrome');
  await waitForHydration(page, 15000).catch(() => false);
  await sleep(1500);

  for (const item of items) {
    mark('evidence', item.text);
    if (item.clickTab) await openTab(page, item.clickTab);
    const target = await findEvidence(page, item.text, !!item.clickTab);
    void checkpoint('evidence', `doc shows "${item.text}"`, () => (target ? probeText(target) : null));
    if (!target) {
      console.warn(`   ⚠️ Evidence not found on the doc page: "${item.text}"`);
      continue;
    }
    console.log(`   👉 ${item.caption}`);
    await wheelIntoView(page, target, item.text);
    await dragSelect(page, target, item.text);
    for (let i = 0; i < 4; i++) {
      await sleep(900);
      await idleNudge(page);
    }
  }
}

/**
 * Where the wheel scrolls the doc page itself. docs.copilotkit.ai scrolls a full-height <div>, not
 * the window; code boxes (max-h 600px) and the sidebars have their own scrollbars and would eat the
 * wheel, and the sticky header scrolls nothing. Probe a few points over the article and keep the
 * first whose nearest scrolling ancestor is the page scroller (clientHeight >= 70% of the window).
 */
async function pageWheelPoint(page: Page): Promise<{ x: number; y: number } | null> {
  return page
    .evaluate(() => {
      const art = document.querySelector('article') ?? document.querySelector('main');
      const r = art ? art.getBoundingClientRect() : { left: 300, right: window.innerWidth - 300 };
      const xs = [r.left + 6, r.left + 18, r.right - 8, (r.left + r.right) / 2];
      const h = window.innerHeight;
      const ys = [h * 0.5, h * 0.4, h * 0.62, h * 0.3, h * 0.72];
      for (const y of ys) {
        for (const x of xs) {
          let el = document.elementFromPoint(x, y) as HTMLElement | null;
          for (; el && el !== document.body; el = el.parentElement) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4) break;
          }
          if (el && el !== document.body && el.clientHeight >= h * 0.7) return { x, y };
        }
      }
      return null;
    })
    .catch(() => null);
}

/** The text's centre Y, and the rect of its own (non-page) scroll box if it sits in one. */
async function scrollInfo(target: Locator, text?: string): Promise<{ textY: number | null; inner: { top: number; bottom: number; left: number; right: number } | null }> {
  const textY = text ? await textCentreY(target, text) : null;
  const inner = await target
    .evaluate((el) => {
      const h = window.innerHeight;
      for (let e: HTMLElement | null = el as HTMLElement; e && e !== document.body; e = e.parentElement) {
        const oy = getComputedStyle(e).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 4) {
          if (e.clientHeight >= h * 0.7) return null; // the page scroller
          const r = e.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        }
      }
      return null;
    })
    .catch(() => null);
  return { textY, inner };
}

async function wheelBurst(page: Page, delta: number): Promise<void> {
  const notches = Math.max(2, Math.round(Math.abs(delta) / 100));
  for (let n = 0; n < notches; n++) {
    await page.mouse.wheel(0, delta / notches);
    await sleep(35 + Math.random() * 45);
  }
  await sleep(250 + Math.random() * 400);
}

/**
 * Wheel the page (from a point that scrolls the page) until the text is mid-screen; if the text sits
 * in a code box with its own scrollbar, then wheel over that box until the line is inside it.
 */
async function wheelIntoView(page: Page, target: Locator, text?: string): Promise<void> {
  const vh = page.viewportSize()?.height ?? 900;
  const mid = vh * 0.5;
  for (let i = 0; i < 60; i++) {
    const box = await target.boundingBox().catch(() => null);
    if (!box) break;
    const { textY, inner } = await scrollInfo(target, text);
    const ty = textY ?? box.y + Math.min(box.height, 120) / 2;
    // 1. The box is on screen but the line is scrolled away inside it: wheel over the box.
    if (inner && inner.top > 60 && inner.bottom < vh - 30 && (ty < inner.top + 24 || ty > inner.bottom - 24)) {
      const cx = inner.left + Math.min(220, (inner.right - inner.left) / 2);
      const cy = (inner.top + inner.bottom) / 2;
      const { x, y } = getGlobalCursorPos();
      if (Math.abs(x - cx) > 40 || Math.abs(y - cy) > 40) await humanGlide(page, cx, cy);
      const want = ty - cy;
      await wheelBurst(page, Math.sign(want) * Math.min(Math.abs(want), 420));
      continue;
    }
    // 2. Otherwise move the page so the line (or the box) sits mid-screen.
    const anchor = inner && (ty < inner.top || ty > inner.bottom) ? (inner.top + inner.bottom) / 2 : ty;
    const off = anchor - mid;
    if (Math.abs(off) < 140) break;
    const pt = (await pageWheelPoint(page)) ?? { x: 40, y: mid };
    const { x, y } = getGlobalCursorPos();
    if (Math.abs(x - pt.x) > 60 || Math.abs(y - pt.y) > 60) await humanGlide(page, pt.x, pt.y);
    await wheelBurst(page, Math.sign(off) * Math.min(Math.abs(off), 300 + Math.random() * 200));
  }
  await sleep(600);
}

/** Click a doc tab (e.g. "Code") the way a reader would, after wheeling it into view. */
async function openTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name, exact: true }).first();
  if (!(await tab.isVisible().catch(() => false))) {
    console.warn(`   ⚠️ Doc tab "${name}" not found`);
    return;
  }
  if ((await tab.getAttribute('aria-selected').catch(() => null)) === 'true') return;
  await wheelIntoView(page, tab);
  const b = await tab.boundingBox();
  if (!b) return;
  await humanGlide(page, b.x + b.width / 2, b.y + b.height / 2, 20);
  await sleep(250);
  await humanClick(page);
  await sleep(1500);
}

interface TextSpan { sx: number; sy: number; ex: number; ey: number }

async function locateText(target: Locator, text: string): Promise<TextSpan | null> {
  // Plain loops only: tsx's `__name` helper does not exist inside the page.
  return target
    .evaluate((el, needle) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let full = '';
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        nodes.push(n as Text);
        full += (n as Text).data;
      }
      for (let at = full.indexOf(needle); at >= 0; at = full.indexOf(needle, at + 1)) {
        const rects: DOMRect[] = [];
        for (const pos of [at, at + needle.length - 1]) {
          let acc = 0;
          for (const node of nodes) {
            if (pos < acc + node.data.length) {
              const r = document.createRange();
              r.setStart(node, pos - acc);
              r.setEnd(node, Math.min(pos - acc + 1, node.data.length));
              const b = r.getBoundingClientRect();
              if (b.width > 0 && b.height > 0) rects.push(b);
              break;
            }
            acc += node.data.length;
          }
        }
        if (rects.length === 2) {
          const [s, e] = rects;
          return { sx: s.left + 1, sy: s.top + s.height / 2, ex: e.right - 1, ey: e.top + e.height / 2 };
        }
      }
      return null;
    }, text)
    .catch((err) => {
      console.warn(`   ⚠️ locateText failed: ${String(err).slice(0, 160)}`);
      return null;
    });
}

async function textCentreY(target: Locator, text: string): Promise<number | null> {
  return (await locateText(target, text))?.sy ?? null;
}

async function dragSelect(page: Page, target: Locator, text: string): Promise<void> {
  const pts = await locateText(target, text);
  const vh = page.viewportSize()?.height ?? 900;
  // Never drag at a guess: a miss selects whatever is under the cursor (the docs banner, prose).
  if (!pts || pts.sy < 70 || pts.ey > vh - 30) {
    console.warn(`   ⚠️ Text not on screen, not selecting: "${text}"`);
    return;
  }
  await humanGlide(page, pts.sx - 3, pts.sy);
  await sleep(300 + Math.random() * 300);
  await page.mouse.down();
  await humanGlide(page, pts.ex + 2, pts.ey, 34);
  await sleep(120);
  await page.mouse.up();
}

/** Doc evidence, then the note typed into Notepad (humanized), with timeline marks. */
export async function showFinding(
  page: Page,
  config: PageRecordConfig,
  items: DocEvidence[] | undefined,
  note: string | undefined,
  fileName = `finding-${config.id}.txt`,
): Promise<void> {
  await showDocEvidence(page, config, items).catch((e) => console.warn(`   ⚠️ Doc evidence step failed: ${String(e).slice(0, 120)}`));
  if (!note) return;
  mark('notepad');
  await openNotepad(page, fileName);
  await typeInNotepad(page, humanizeNote(note), TYPING);
  await closeNotepad(page, 4000);
  mark('notepad-closed');
}

// humanizeNote: the shared hurried Notepad style lives in core/overlays/note-style.ts (AUTORECORDER.md section 2).
export { humanizeNote };
