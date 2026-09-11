/**
 * The page list, read from the recorder's own config.
 *
 * `autorecorder/config/pages.config.ts` is the single source of truth for which
 * demos exist. Restating the ids in the workflow (dispatch checkboxes, a bash
 * mapping) is what drifted silently whenever a page was renamed, so everything
 * reads them from here instead.
 *
 * The ids are extracted textually rather than by importing the module, so this
 * stays a plain .mjs helper with no tsx/TypeScript dependency — which is what
 * lets the drift gate run on a bare checkout, before any install.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RECORDER_DIR } from './config.mjs';

const PAGES_CONFIG = path.join(RECORDER_DIR, 'config', 'pages.config.ts');

/**
 * Dispatch checkbox groups, mirroring the doc nav.
 *
 * One checkbox per page would be the obvious design, but GitHub allows a
 * `workflow_dispatch` at most 10 inputs, and the four option fields already
 * take four of them. Five groups keeps checkboxes for the common case and
 * leaves a spare input; the `pages` field stays for picking exact pages.
 *
 * `threads` holds the four demos that share one doc page
 * (`guides/threads-memory-attachments-headless`) — ticking it records that page
 * end to end, which is how the doc reads.
 *
 * Every page id must appear in exactly one group — `assertGroupsCoverAllPages`
 * enforces that, so a newly added page cannot silently become unreachable from
 * the dispatch form.
 */
export const PAGE_GROUPS = {
  // `inspector` rides in this group rather than getting a checkbox of its own:
  // the dispatch form is already at GitHub's ten-input limit, and the page it
  // documents is reached from the quickstart's own closing step.
  getting_started: ['quickstart', 'inspector', 'chat-ui'],
  generative_ui: ['frontend-tools-generative-ui'],
  interaction: ['voice-multimodal', 'human-in-the-loop'],
  shared_state: ['shared-state'],
  threads: ['threads', 'headless'],
};

export function readPageIds() {
  let src;
  try {
    src = fs.readFileSync(PAGES_CONFIG, 'utf8');
  } catch {
    throw new Error(`Cannot read page config at ${PAGES_CONFIG}`);
  }

  const ids = [...src.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
  // The generated per-package-manager pages write their id as a template,
  // `demo-${pm}`, over the `{ pm: '...' }` table above it. Expand it the same
  // way, or those pages are invisible here: unselectable from the dispatch
  // form and missing from the coverage check that claims every page is grouped.
  for (const tpl of src.matchAll(/^\s*id:\s*`([^`$]*)\$\{(\w+)\}([^`]*)`/gm)) {
    const [, before, variable, after] = tpl;
    const values = [...src.matchAll(new RegExp(`\\{\\s*${variable}:\\s*'([^']+)'`, 'g'))].map((m) => m[1]);
    for (const v of values) ids.push(`${before}${v}${after}`);
  }
  if (ids.length === 0) {
    throw new Error(`No page ids found in ${PAGES_CONFIG}`);
  }
  return ids;
}

/**
 * Validate a comma-separated selection against the real page list. Returns the
 * cleaned ids. Throws naming the unknown ones, so a typo fails immediately
 * instead of silently recording nothing.
 */
export function resolvePageSelection(raw) {
  const known = readPageIds();
  const wanted = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (wanted.length === 0) return [];

  const unknown = wanted.filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown page id(s): ${unknown.join(', ')}\nValid ids: ${known.join(', ')}`,
    );
  }
  return wanted;
}

/**
 * Fail when the group map and the recorder config disagree — a page that
 * belongs to no group, a group naming a page that no longer exists, or a page
 * listed twice.
 */
export function assertGroupsCoverAllPages() {
  const known = readPageIds();
  const grouped = Object.values(PAGE_GROUPS).flat();

  const problems = [];

  const missing = known.filter((id) => !grouped.includes(id));
  if (missing.length > 0) {
    problems.push(
      `Page(s) in no group (unreachable from the dispatch checkboxes): ${missing.join(', ')}`,
    );
  }

  const stale = grouped.filter((id) => !known.includes(id));
  if (stale.length > 0) {
    problems.push(`Group(s) reference unknown page(s): ${stale.join(', ')}`);
  }

  const duplicates = grouped.filter((id, i) => grouped.indexOf(id) !== i);
  if (duplicates.length > 0) {
    problems.push(`Page(s) in more than one group: ${[...new Set(duplicates)].join(', ')}`);
  }

  if (problems.length > 0) {
    throw new Error(`${problems.join('\n')}\nFix PAGE_GROUPS in ci/lib/pages.mjs.`);
  }
}

/**
 * Expand the dispatch form into a page-id list.
 *
 * `pages` (exact ids) and any ticked groups are unioned, keeping the recorder's
 * own page order. Nothing selected means "record everything", which is what the
 * nightly schedule does.
 */
export function resolveSelection({ pages = '', groups = [] } = {}) {
  assertGroupsCoverAllPages();

  const explicit = resolvePageSelection(pages);

  const unknownGroups = groups.filter((g) => !(g in PAGE_GROUPS));
  if (unknownGroups.length > 0) {
    throw new Error(
      `Unknown group(s): ${unknownGroups.join(', ')}\nValid groups: ${Object.keys(PAGE_GROUPS).join(', ')}`,
    );
  }

  const fromGroups = groups.flatMap((g) => PAGE_GROUPS[g]);
  const selected = new Set([...explicit, ...fromGroups]);

  // Preserve the recorder's declared order so shards stay predictable.
  return readPageIds().filter((id) => selected.has(id));
}
