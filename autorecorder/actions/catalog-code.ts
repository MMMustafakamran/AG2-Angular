/**
 * The beat where the recording admits whose code the catalog snippet is.
 *
 * The A2UI guide's `a2uiConfigForFeature` returns `beautifulCatalog`,
 * `declarativeCatalog` and `fixedCatalog`, and declares none of them — there is
 * no `createCatalog` call anywhere on the page either. Nothing in this repo
 * registers a catalog: `app.config.ts` sets `a2ui.recovery` and deliberately no
 * `a2ui.catalog`, because supplying one would mean inventing code the guide does
 * not give. That absence is the finding the clip exists to show.
 *
 * So the catalog code exists in exactly one place: as two template literals in
 * `frontend/src/app/pages/a2ui.ts`, reconstructed from the fragments the guide
 * does show. This beat opens **that file** in the simulated VS Code and rests on
 * those lines, then writes — in Notepad, in the tester's own words — that the
 * guide never declared these and this code was written to stand in for them.
 * Then it returns to the demo route and the take continues as before.
 *
 * It used to browse the harness's own `/a2ui` notes route and drag a selection
 * across the rendered `<ui-doc-sample>` block. Showing the source file instead
 * removes the ambiguity that beat was fighting: a reader of the video sees the
 * path crumb and the line numbers, so there is no question whether they are
 * looking at a page that renders a quotation or at code that runs.
 *
 * Deliberately non-fatal: if the file or the snippets are not where this expects
 * them, it warns and returns false. The demo that follows is the recording's
 * substance and must still run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Page } from 'playwright';

import { SELECTORS } from '../config/selectors.config';
import { generateIdeHtml } from '../core/ide/generator';
import { humanGlide, sleep } from '../core/overlays/cursor';
import { ensureOverlays } from '../core/overlays/taskbar';
import { type PageRecordConfig } from '../core/types';

/**
 * The only file in this repo that carries the catalog code.
 *
 * Not `features/a2ui/a2ui-catalogs.ts` — the path the snippet's own header
 * comment claims. No such file exists, and none can: the code references `z`,
 * `dynamicString` and `A2UIConfig`, which are declared nowhere, so a real
 * module at that path would fail `ng build`. Held as strings on the page
 * component is the only form this code can take here, and that is the point.
 */
const CATALOG_FILE = 'frontend/src/app/pages/a2ui.ts';

/**
 * Virtual path the IDE view is served from, on the frontend's own origin.
 *
 * Intercepted by Playwright and fulfilled from memory — it never reaches the dev
 * server. Distinct from the engine's own `/__autorecord_ide__` so this beat can
 * never collide with the Step 2 route the engine may still have registered.
 */
const IDE_ROUTE_PATH = '/__autorecord_catalog_ide__';

const BEAT = {
  /** Rest after the editor paints, before anything moves. */
  settleMs: 1200,
  /** How long the definitions block stands on its own. */
  holdDefinitionsMs: 3000,
  /** How long the catalog-selection function stands on its own. */
  holdSelectionMs: 2600,
  /** Reading room after the last keystroke of the note. */
  afterNoteMs: 1000,
} as const;

interface CatalogRange {
  /** First line of `fixedDefinitionsSample`. */
  startLine: number;
  /** Closing line of `catalogSelectionSample`. */
  endLine: number;
  /** First line of `catalogSelectionSample` — the three undeclared catalogs. */
  selectionLine: number;
}

/**
 * Finds the two snippet blocks by name rather than by fixed line numbers.
 *
 * The numbers are 101/118/135 in every Angular repo today, and hard-coding them
 * would silently film the wrong lines the first time anyone edits the page above
 * them. Matching the declarations means an edit either still resolves or reports
 * that it did not.
 */
function locateCatalogCode(rootPath: string): CatalogRange | null {
  let lines: string[];
  try {
    lines = readFileSync(join(rootPath, CATALOG_FILE), 'utf-8')
      .replace(/\r\n/g, '\n')
      .split('\n');
  } catch {
    return null;
  }

  // 1-based, to match what the editor gutter and `generateIdeHtml` both use.
  const lineOf = (re: RegExp, from = 0): number => {
    const idx = lines.findIndex((l, i) => i >= from && re.test(l));
    return idx === -1 ? 0 : idx + 1;
  };

  const startLine = lineOf(/fixedDefinitionsSample\s*=/);
  const selectionLine = lineOf(/catalogSelectionSample\s*=/);
  if (!startLine || !selectionLine) return null;

  // The line that closes the selection block: the first backtick-semicolon
  // terminator at or after it. `lineOf` is 1-based and `findIndex` takes a
  // 0-based cursor, so the search starts at `selectionLine` itself.
  const endLine = lineOf(/`;\s*$/, selectionLine) || lines.length;

  return { startLine, endLine, selectionLine };
}

/**
 * A short fade as the editor window comes up.
 *
 * Mirrors `withWindowFade` in core/engine.ts, which is module-private there.
 * Without it the IDE appears in a single frame, which is how a navigation looks
 * and not how an app switch does.
 */
function withWindowFade(html: string): string {
  const style =
    '<style>@keyframes __arWinIn{from{opacity:0;transform:scale(.992)}to{opacity:1;transform:none}}' +
    'body{animation:__arWinIn .18s ease-out both}</style>';
  return html.includes('</head>')
    ? html.replace('</head>', `${style}</head>`)
    : style + html;
}

/**
 * Smoothly scrolls the editor pane so `line` sits about a third of the way down.
 *
 * The same 22px line height and cubic ease the engine's own IDE step uses, kept
 * here rather than imported because that helper is private to core/engine.ts.
 * Scoped to `#ide-view-0`: this view has one tab, but the id keeps it explicit.
 */
async function scrollToLine(page: Page, line: number): Promise<void> {
  const targetScrollTop = Math.max(0, (line - 8) * 22);

  await page
    .evaluate(async (targetY) => {
      const viewport = document.querySelector(
        '#ide-view-0 .code-viewport',
      ) as HTMLElement | null;
      if (!viewport) return;

      const startY = viewport.scrollTop;
      const distance = targetY - startY;
      if (Math.abs(distance) < 15) return;

      const steps = 32;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const progress =
          t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        viewport.scrollTop = startY + distance * progress;
        await new Promise((r) => setTimeout(r, 20));
      }
    }, targetScrollTop)
    .catch(() => {});

  await sleep(350);
}

/**
 * Rests the cursor on the first highlighted line, or mid-pane if none is shown.
 *
 * `generateIdeHtml` marks every line in the configured range with
 * `.code-line.highlighted`, so this points at code the viewer can see is
 * singled out rather than at an arbitrary spot in the file.
 */
async function restOnHighlight(page: Page): Promise<void> {
  const line = page.locator('#ide-view-0 .code-line.highlighted').first();
  const box = (await line.isVisible({ timeout: 2000 }).catch(() => false))
    ? await line.boundingBox().catch(() => null)
    : null;

  if (box) {
    await humanGlide(
      page,
      box.x + Math.min(box.width / 2, 420),
      box.y + Math.min(box.height / 2, 30),
      18,
    );
  } else {
    await humanGlide(page, 520, 360, 18);
  }
}

/**
 * Opens the catalog code in VS Code, writes the note, and hands back.
 *
 * @param rootPath repo root, as handed to every action — `generateIdeHtml`
 *                 resolves `CATALOG_FILE` against it and reads the file off disk.
 * @param writeNote opens the repo's own Notepad flavour and types the finding.
 *                  Passed in rather than called directly because the repos do
 *                  not share one note helper — `actions/notepad.ts` in most,
 *                  `actions/scratch-note.ts` in the DeepAgents repo — and the
 *                  window's position is a per-take framing decision anyway.
 * @returns whether the code was actually shown; false means the take simply
 *          carries on without this beat.
 */
export async function showReconstructedCatalogCode(
  page: Page,
  config: PageRecordConfig,
  rootPath: string,
  writeNote: (page: Page) => Promise<void>,
): Promise<boolean> {
  const range = locateCatalogCode(rootPath);
  if (!range) {
    console.warn(
      `   ⚠️ No catalog snippets found in ${CATALOG_FILE} — skipping the catalog-code beat.`,
    );
    return false;
  }

  console.log(
    `   💻 Showing where the catalog code came from: ${CATALOG_FILE} lines ${range.startLine}-${range.endLine}`,
  );

  const ideUrl = new URL(IDE_ROUTE_PATH, config.demoUrl).toString();

  try {
    const html = await generateIdeHtml(
      rootPath,
      CATALOG_FILE,
      range.startLine,
      range.endLine,
    );
    await page.route(ideUrl, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: withWindowFade(html),
      }),
    );
    await page.goto(ideUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await ensureOverlays(page, 'vscode');
  } catch (e) {
    console.warn(
      `   ⚠️ Could not open ${CATALOG_FILE} in the editor view (${e}) — skipping the catalog-code beat.`,
    );
    await page.unroute(ideUrl).catch(() => {});
    return false;
  }

  await sleep(BEAT.settleMs);

  // The definitions first — `dynamicString` is undefined here too.
  await scrollToLine(page, range.startLine);
  await restOnHighlight(page);
  await sleep(BEAT.holdDefinitionsMs);

  // Then the function that returns the three catalogs the note is about.
  await scrollToLine(page, range.selectionLine);
  await sleep(BEAT.holdSelectionMs);

  await writeNote(page);
  await sleep(BEAT.afterNoteMs);

  await page.unroute(ideUrl).catch(() => {});
  return true;
}

/**
 * Moves an already-open Notepad window off the middle of the screen.
 *
 * `core/overlays/notepad.ts` centres its window and takes no position, which is
 * right for a note about a chat but wrong here: centred, it lands squarely on
 * the code the note is about. `actions/notepad.ts` takes a position and needs
 * none of this. Both ids are handled so a repo can switch flavours without this
 * beat quietly re-covering the evidence.
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
