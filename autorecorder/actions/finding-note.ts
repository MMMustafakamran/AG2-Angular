/**
 * The finding note — how a clip says what is wrong, on screen, in writing.
 *
 * project-context.md is explicit that a clean run against broken docs is a
 * failed run, and that broken pages keep their broken implementation because
 * "the clip exists to show the defect". But a video of a feature not working
 * looks identical to a video of a recorder that mis-clicked. The difference has
 * to be stated, in the clip, while the evidence is still on screen behind it.
 *
 * So every page with a finding ends the same way:
 *
 *   1. drive the feature until the defect actually happens
 *   2. rest the cursor on the evidence, long enough to read it
 *   3. open Notepad and type the finding out at human speed
 *   4. hold, then close — evidence still visible behind the whole thing
 *
 * This module is the third step, and exists so the eight pages that need a note
 * do not each invent their own wording, geometry and dwell time. A note that
 * reads the same on every page reads as a report; eight hand-rolled ones read
 * as eight different people guessing.
 *
 * ── House format ───────────────────────────────────────────────────────────
 * `saw` is what the viewer just watched happen — observable, not inferred.
 * `why` is the cause, naming the file or symbol wherever one can be named.
 * `doc` is what the page failed to tell the reader, which is the actual
 * deliverable: rule 3 of project-context.md counts ambiguity as a defect.
 *
 * Keep each list to short lines. Typing runs at roughly 25-50ms a character, so
 * 400 characters is about twenty seconds of screen time — long enough to read,
 * short enough that nobody scrubs past it.
 *
 * Like `notepad.ts` this is framework-agnostic and **belongs in `core/`**; it
 * lives here only because `core/` is frozen. Promote it when that changes.
 */
import { type Page } from 'playwright';

import { beat, humanGlide, sleep } from '../core/overlays/cursor';

import { closeNotepadNote, openNotepadWindow, typeInNotepad } from './notepad';

export interface FindingNote {
  /** Notepad filename. Convention: `<page-id>-finding.txt`. */
  file: string;
  /** One line, lowercase, stating the verdict. Not a restatement of the page title. */
  headline: string;
  /** What the viewer just watched happen. Observable facts only. */
  saw: string[];
  /** The cause. Name the file, symbol or line where one can be named. */
  why: string[];
  /** What the doc page fails to say. Omit only when the doc is not at fault. */
  doc?: string[];
}

/** Where the note sits: right-hand side, clear of the chat surfaces. */
const PANEL = {
  right: '32px',
  top: '95px',
  width: '700px',
  height: '580px',
} as const;

/** Typing focus, inside the note body. */
const FOCUS_X = 1560;
const FOCUS_Y = 260;

/**
 * Rests the cursor on the thing the note is about, so the viewer is looking at
 * the evidence before anything is claimed about it.
 *
 * Silently does nothing when the element is absent — for several of these pages
 * "the element never rendered" IS the finding, and the note still has to be
 * written.
 */
export async function dwellOn(
  page: Page,
  selector: string,
  ms = 2200,
): Promise<boolean> {
  const box = await page
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);

  if (!box) return false;

  await humanGlide(
    page,
    box.x + Math.min(box.width / 2, 260),
    box.y + Math.min(box.height / 2, 60),
    22,
  );
  await sleep(ms);
  return true;
}

/** Renders one finding note: open, type, hold, close. */
export async function showFindingNote(page: Page, note: FindingNote): Promise<void> {
  const lines: string[] = [note.headline, ''];

  lines.push('what happened:');
  for (const line of note.saw) lines.push(`  - ${line}`);

  lines.push('', 'why:');
  for (const line of note.why) lines.push(`  ${line}`);

  if (note.doc?.length) {
    lines.push('', 'the doc does not say:');
    for (const line of note.doc) lines.push(`  ${line}`);
  }

  console.log(`   🧾 Writing the finding: ${note.headline}`);
  await openNotepadWindow(page, note.file, PANEL);
  await typeInNotepad(page, lines, FOCUS_X, FOCUS_Y);

  // Read time scales with the note, floored so a short one is not a flash and
  // capped so a long one does not stall the clip.
  const readMs = Math.min(9000, Math.max(4500, lines.join('').length * 22));
  console.log(`   📖 Holding on the note (${(readMs / 1000).toFixed(1)}s)...`);
  await humanGlide(page, FOCUS_X - 20, FOCUS_Y + 120, 20);
  await sleep(readMs);

  await closeNotepadNote(page);
  await beat(1200);
}
