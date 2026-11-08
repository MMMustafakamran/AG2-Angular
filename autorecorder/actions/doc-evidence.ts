import { type Locator, type Page } from 'playwright';
import { type PageRecordConfig } from '../core/types';
import { getGlobalCursorPos, humanGlide, idleNudge, sleep } from '../core/overlays/cursor';
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
}

export const TYPING = { charDelayMs: 34, jitter: 0.65, thinkChance: 0.05 };

async function findEvidence(page: Page, text: string) {
  for (const sel of ['pre', 'code', 'p', 'li', 'h2', 'h3']) {
    const all = page.locator(sel, { hasText: text });
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
    const target = await findEvidence(page, item.text);
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

async function wheelIntoView(page: Page, target: Locator, text?: string): Promise<void> {
  await humanGlide(page, 760, 520);
  for (let i = 0; i < 50; i++) {
    const box = await target.boundingBox().catch(() => null);
    if (!box) break;
    const textY = text ? await textCentreY(target, text) : null;
    const centre = textY ?? box.y + Math.min(box.height, 120) / 2;
    const overX = box.x + Math.min(box.width / 2, 260);
    const overY = Math.min(Math.max(box.y + 40, 160), Math.min(box.y + box.height - 20, 900));
    const { x, y } = getGlobalCursorPos();
    if (Math.abs(x - overX) > 60 || Math.abs(y - overY) > 60) await humanGlide(page, overX, overY);
    const off = centre - 470;
    if (Math.abs(off) < 140) break;
    const burst = Math.sign(off) * Math.min(Math.abs(off), 300 + Math.random() * 200);
    const notches = Math.max(2, Math.round(Math.abs(burst) / 100));
    for (let n = 0; n < notches; n++) {
      await page.mouse.wheel(0, burst / notches);
      await sleep(35 + Math.random() * 45);
    }
    await sleep(250 + Math.random() * 450);
  }
  await sleep(600);
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
  let pts = await locateText(target, text);
  if (!pts) {
    console.warn(`   ⚠️ Exact text not rendered, selecting the element's first line: "${text}"`);
    const b = await target.boundingBox();
    if (!b) return;
    pts = { sx: b.x + 4, sy: b.y + 12, ex: Math.min(b.x + b.width - 4, b.x + 700), ey: b.y + 12 };
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
