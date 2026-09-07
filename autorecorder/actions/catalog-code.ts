/**
 * The beat where the recording admits whose code the catalog snippet is.
 *
 * The A2UI guide's `a2uiConfigForFeature` returns `beautifulCatalog`,
 * `declarativeCatalog` and `fixedCatalog`, and declares none of them — there is
 * no `createCatalog` call anywhere on the page either. So the harness route
 * `/a2ui` carries those snippets as `<ui-doc-sample>` blocks: reconstructed
 * here, from the fragments the guide does show, precisely because a reader
 * cannot lift a working one out of the guide.
 *
 * A viewer has no way to tell a quoted snippet from a working one, and the
 * whole finding turns on which it is. So before the demo runs, the take scrolls
 * to that block, drags a selection across it, and writes — in Notepad, in the
 * tester's own words — that the guide never declared these and this code was
 * written to stand in for them. Then it returns to the demo route and the take
 * continues as before.
 *
 * Deliberately non-fatal: if the harness page or the sample block is not there,
 * this warns and returns false. The demo that follows is the recording's
 * substance and must still run.
 */
import { type Page } from 'playwright';

import { SELECTORS } from '../config/selectors.config';
import { humanGlide, sleep } from '../core/overlays/cursor';
import { ensureOverlays } from '../core/overlays/taskbar';
import { type PageRecordConfig } from '../core/types';

/**
 * `ui-doc-sample` renders `figure.code-figure--quoted` — the "not mounted"
 * badge in its caption bar is the class's entire reason to exist, so it marks
 * exactly the blocks this tour is about and never a real source listing
 * (`ui-source`, which renders `figure.code-figure` without the modifier).
 */
const QUOTED_FIGURE = 'figure.code-figure--quoted';

/** Caption of the block that returns the three undeclared catalogs. */
const WANTED_CAPTION = /catalog selection/i;

/** Handle stamped on the chosen figure, so every later step means the same one. */
const TOUR_ATTR = 'data-a2ui-tour';
const TOUR_FIGURE = `[${TOUR_ATTR}="1"]`;

/** Overlay class for the mark that outlives the click into Notepad. */
const PIN_CLASS = 'a2ui-code-pin';

const BEAT = {
  /** Rest after the page paints, before anything moves. */
  settleMs: 1200,
  /** Room for the smooth scroll to land and stop. */
  scrollMs: 1600,
  /** Dead air after the block is centred, before the drag starts. */
  beforeSelectMs: 900,
  /** How long the finished selection stands on its own. */
  holdMs: 2600,
  /** Reading room after the last keystroke of the note. */
  afterNoteMs: 1000,
} as const;

/** The route the samples live on: the demo URL without its `/demo` suffix. */
function notesUrlFor(demoUrl: string): string | null {
  const notes = demoUrl.replace(/\/demo\/?$/, '');
  return notes === demoUrl ? null : notes;
}

/**
 * Finds the catalog-selection sample and stamps it, returning whether it exists.
 *
 * Matches on the caption rather than on document order: the page shows two
 * quoted blocks (`fixedDefinitions` first, catalog selection second) and an
 * edit that reorders them would otherwise silently film the wrong one.
 */
async function markTargetFigure(page: Page): Promise<boolean> {
  return (await page
    .evaluate(
      ({ sel, attr, captionPattern }) => {
        const figures = Array.from(
          document.querySelectorAll(sel),
        ) as HTMLElement[];
        if (figures.length === 0) return false;

        const wanted = new RegExp(captionPattern, 'i');
        const chosen =
          figures.find((f) =>
            wanted.test(f.querySelector('figcaption')?.textContent ?? ''),
          ) ?? figures[figures.length - 1];

        document
          .querySelectorAll(`[${attr}]`)
          .forEach((el) => el.removeAttribute(attr));
        chosen.setAttribute(attr, '1');
        return true;
      },
      {
        sel: QUOTED_FIGURE,
        attr: TOUR_ATTR,
        captionPattern: WANTED_CAPTION.source,
      },
    )
    .catch(() => false)) as boolean;
}

/**
 * Centres the marked figure with the browser's own smooth scroll.
 *
 * `scrollIntoView` rather than a hand-rolled wheel loop: this is our own
 * layout, the scroller is `main#main` and it honours `behavior: 'smooth'`
 * (the docs site does not, which is why `a2ui.action.ts` in the Agno repo
 * carries a wheel-driven scroller instead). The instant retry below is there
 * because a smooth scroll interrupted by hydration stops wherever it got to,
 * and a block that is half off-screen cannot be dragged across.
 */
async function centreFigure(page: Page): Promise<void> {
  await page
    .evaluate((sel) => {
      document
        .querySelector(sel)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, TOUR_FIGURE)
    .catch(() => {});
  await sleep(BEAT.scrollMs);

  const settled = await page
    .evaluate((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return !!r && r.top > -20 && r.top < window.innerHeight * 0.75;
    }, TOUR_FIGURE)
    .catch(() => false);

  if (!settled) {
    await page
      .evaluate((sel) => {
        document
          .querySelector(sel)
          ?.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, TOUR_FIGURE)
      .catch(() => {});
    await sleep(500);
  }
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Viewport box of the code body inside the marked figure. */
async function codeBox(page: Page): Promise<Box | null> {
  return (await page
    .locator(`${TOUR_FIGURE} pre`)
    .first()
    .boundingBox()
    .catch(() => null)) as Box | null;
}

/**
 * Drags a selection across the whole snippet, top-left to bottom-right.
 *
 * A real drag, not a programmatic Range, because the sweep is the part the
 * viewer reads as someone marking code they are about to talk about. The
 * bottom edge is clamped above the taskbar overlay: a drag that ends underneath
 * it releases the mouse on the overlay instead of the page and selects nothing.
 * The Range below is the fallback for exactly that case — the mark matters more
 * than how it was made.
 */
async function selectCode(page: Page, box: Box): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1920, height: 1080 };
  const bottomLimit = viewport.height - 80;

  const from = { x: box.x + 10, y: box.y + 12 };
  const to = {
    x: Math.min(box.x + box.width - 10, viewport.width - 12),
    y: Math.min(box.y + box.height - 10, bottomLimit),
  };

  await humanGlide(page, from.x, from.y, 26);
  await sleep(400);
  await page.mouse.down();
  await sleep(150);

  const travel = Math.hypot(to.x - from.x, to.y - from.y);
  await humanGlide(page, to.x, to.y, Math.max(20, Math.round(travel / 8)));
  await sleep(180);
  await page.mouse.up();

  const selected = (await page
    .evaluate(() => (window.getSelection()?.toString() ?? '').length)
    .catch(() => 0)) as number;

  if (selected < 20) {
    console.warn(
      `   ⚠️ The drag selected ${selected} character(s) — falling back to a range over the block.`,
    );
    await page
      .evaluate((sel) => {
        const code = document.querySelector(`${sel} pre`);
        if (!code) return;
        const range = document.createRange();
        range.selectNodeContents(code);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(range);
      }, TOUR_FIGURE)
      .catch(() => {});
  }
}

/**
 * Repaints the selection as a fixed overlay so it survives opening Notepad.
 *
 * Any click collapses a text selection, and opening Notepad clicks twice — the
 * taskbar icon and the note body. Without this the block would sit unmarked for
 * exactly the stretch in which the note explains it. A tinted box with a border
 * rather than a solid highlight: the code underneath has to stay readable,
 * since it is the thing being pointed at.
 */
async function pinCode(page: Page, box: Box): Promise<void> {
  await page
    .evaluate(
      ({ b, cls }) => {
        const el = document.createElement('div');
        el.className = cls;
        el.style.cssText = [
          'position:fixed',
          `left:${b.x - 3}px`,
          `top:${b.y - 3}px`,
          `width:${b.width + 6}px`,
          `height:${b.height + 6}px`,
          'background:rgba(59,130,246,.20)',
          'border:2px solid rgba(59,130,246,.85)',
          'border-radius:6px',
          'z-index:2147483000',
          'pointer-events:none',
        ].join(';');
        document.body.appendChild(el);
      },
      { b: box, cls: PIN_CLASS },
    )
    .catch(() => {});
}

/** Clears the overlay mark and any live selection. */
async function clearMarks(page: Page): Promise<void> {
  await page
    .evaluate(
      ({ cls, attr }) => {
        document.querySelectorAll(`.${cls}`).forEach((el) => el.remove());
        document
          .querySelectorAll(`[${attr}]`)
          .forEach((el) => el.removeAttribute(attr));
        window.getSelection()?.removeAllRanges();
      },
      { cls: PIN_CLASS, attr: TOUR_ATTR },
    )
    .catch(() => {});
}

/**
 * Shows the reconstructed catalog code, writes the note, and returns to the demo.
 *
 * @param writeNote opens the repo's own Notepad flavour and types the finding.
 *                  Passed in rather than called directly because the repos do
 *                  not share one note helper — `actions/notepad.ts` in most,
 *                  `actions/scratch-note.ts` in the DeepAgents repo — and the
 *                  window's position is a per-take framing decision anyway.
 * @returns whether the block was actually shown; false means the take simply
 *          carries on without this beat.
 */
export async function showReconstructedCatalogCode(
  page: Page,
  config: PageRecordConfig,
  writeNote: (page: Page) => Promise<void>,
): Promise<boolean> {
  const notesUrl = notesUrlFor(config.demoUrl);
  if (!notesUrl) {
    console.warn(
      `   ⚠️ ${config.demoUrl} has no '/demo' suffix — cannot find the notes route; skipping the catalog-code beat.`,
    );
    return false;
  }

  console.log(`   📄 Showing where the catalog code came from: ${notesUrl}`);

  try {
    await page.goto(notesUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await ensureOverlays(page, 'chrome');
    await page.waitForSelector(QUOTED_FIGURE, {
      state: 'visible',
      timeout: 15000,
    });
  } catch {
    console.warn(
      `   ⚠️ No quoted code sample on ${notesUrl} — skipping the catalog-code beat.`,
    );
    return false;
  }

  await sleep(BEAT.settleMs);

  if (!(await markTargetFigure(page))) {
    console.warn(
      `   ⚠️ The catalog-selection sample is gone from ${notesUrl} — skipping the catalog-code beat.`,
    );
    return false;
  }

  await centreFigure(page);
  await sleep(BEAT.beforeSelectMs);

  const box = await codeBox(page);
  if (!box) {
    console.warn(`   ⚠️ The sample block has no measurable box — skipping.`);
    await clearMarks(page);
    return false;
  }

  await selectCode(page, box);
  await sleep(BEAT.holdMs);
  // Hand the mark to an overlay before anything clicks.
  await pinCode(page, box);

  await writeNote(page);
  await sleep(BEAT.afterNoteMs);
  await clearMarks(page);

  return true;
}

/**
 * Moves an already-open Notepad window off the middle of the screen.
 *
 * `core/overlays/notepad.ts` centres its window and takes no position, which is
 * right for a note about a chat but wrong here: centred, it lands squarely on
 * the code block the note is about. `actions/notepad.ts` takes a position and
 * needs none of this. Both ids are handled so a repo can switch flavours
 * without this beat quietly re-covering the evidence.
 */
export async function parkNoteWindowRight(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const win = (document.getElementById('__autorecord_notepad') ??
        document.getElementById('win11-notepad-overlay')) as HTMLElement | null;
      if (!win) return;
      win.style.setProperty('left', 'auto', 'important');
      win.style.setProperty('right', '40px', 'important');
      win.style.setProperty('top', '150px', 'important');
      // The centred window's reveal ends on translate(-50%,-50%); dropping it
      // is what actually moves the box, not the left/right pair above.
      win.style.setProperty('transform', 'none', 'important');
      win.style.setProperty('width', 'min(560px,34vw)', 'important');
      win.style.setProperty('height', 'min(400px,44vh)', 'important');
    })
    .catch(() => {});
  await sleep(350);
}

/**
 * Returns to the demo route so the rest of the take runs as it always did.
 *
 * Waits on the same readiness selector the engine's own demo step uses, because
 * the take that follows types into that chat immediately.
 */
export async function returnToDemo(
  page: Page,
  config: PageRecordConfig,
): Promise<void> {
  console.log(`   ↩️  Back to the demo: ${config.demoUrl}`);
  await page.goto(config.demoUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await ensureOverlays(page, 'chrome');
  await page
    .waitForSelector(SELECTORS.chatReady, { state: 'visible', timeout: 30000 })
    .catch(() => {});
  await sleep(1000);
}

/**
 * The note itself, shared so every repo's clip makes the same claim.
 *
 * Lowercase and clipped on purpose — house style for these notes is a person
 * jotting down what they just hit, not a written report.
 */
export const CATALOG_CODE_NOTE = [
  'a2ui catalogs',
  '',
  'beautifulCatalog / declarativeCatalog / fixedCatalog',
  'the guide returns them but never declares them anywhere',
  'so this block is code i wrote myself to fill the gap',
];
