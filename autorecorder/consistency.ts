/**
 * Is every route with a demo actually recorded?
 *
 * `project-context.md` lists, under gaps the pipeline misses:
 *
 *   **Pages with no `/demo` route** — unregistered in the recorder, never
 *   recorded.
 *
 * and its inverse is just as bad: a recorder entry for a route the app no
 * longer marks as having a demo, which records something nobody is claiming to
 * test. Neither shows up anywhere else. The doctor validates that each page
 * *it knows about* is coherent; it has no opinion about pages it was never
 * told about, which is exactly the blind spot.
 *
 * So this compares the two registries directly:
 *
 *   frontend/src/app/lib/nav-config.ts   every route with `hasDemo: true`
 *   autorecorder/config/pages.config.ts  every page the recorder will visit
 *
 * They must be the same set. Adding a guide route without a recorder entry
 * drops it from every future run silently, and the only signal would be someone
 * noticing the clip count went from eleven to eleven.
 *
 *   npm run consistency    print both lists; exit 1 on any mismatch
 *
 * ── Why nav-config is read as text ─────────────────────────────────────────
 * It is an Angular source file. Importing it would pull the whole frontend
 * toolchain into the recorder's dependency tree for four lines of data, and the
 * recorder deliberately does not depend on the app. The shape it matches is
 * fixed by that file's own `RouteMeta` interface, and a rename that broke the
 * pattern would empty the list — which fails loudly here rather than passing
 * quietly, because an empty nav side is itself treated as an error.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGES } from './config/pages.config';

const RECORDER_DIR = fileURLToPath(new URL('.', import.meta.url));
const NAV_CONFIG = join(RECORDER_DIR, '..', 'frontend', 'src', 'app', 'lib', 'nav-config.ts');

/** Routes the app says have a live demo surface, without the leading slash. */
function navDemoRoutes(): string[] {
  const source = readFileSync(NAV_CONFIG, 'utf8');

  // `path` and `hasDemo` are adjacent in every entry, in that order. The
  // Introduction route ('/') carries no hasDemo and is correctly absent: its
  // demoPath() returns undefined, so there is nothing to record.
  const matches = [...source.matchAll(/path:\s*'([^']+)',\s*\n\s*hasDemo:\s*true/g)];

  return matches.map((m) => m[1].replace(/^\//, '')).filter(Boolean);
}

function main(): void {
  const nav = navDemoRoutes();
  const recorded = PAGES.map((p) => p.route);

  console.log('\n=== DEMO ROUTE CONSISTENCY ===');
  console.log(`  nav-config hasDemo : ${nav.length} route(s)`);
  for (const r of nav) console.log(`      ${r}`);
  console.log(`  recorder pages     : ${recorded.length} page(s)`);
  for (const r of recorded) console.log(`      ${r}`);
  console.log('');

  const problems: string[] = [];

  // An empty nav side means the pattern above stopped matching, not that the
  // app has no demos. Treated as a failure so a silent regex rot cannot make
  // this check pass by comparing nothing to nothing.
  if (nav.length === 0) {
    problems.push(
      'Parsed 0 hasDemo routes out of nav-config.ts. The file moved or its ' +
        'shape changed — this check is not measuring anything.',
    );
  }

  const recordedSet = new Set(recorded);
  const navSet = new Set(nav);

  for (const route of nav) {
    if (!recordedSet.has(route)) {
      problems.push(
        `Route '${route}' has a demo in nav-config.ts but no page in ` +
          `config/pages.config.ts — it will never be recorded.`,
      );
    }
  }

  for (const route of recorded) {
    if (!navSet.has(route)) {
      problems.push(
        `Page '${route}' is registered in config/pages.config.ts but no ` +
          `nav-config.ts route marks hasDemo — the recorder is filming ` +
          `something the app does not claim to test.`,
      );
    }
  }

  // Duplicate ids would make `--<id>` ambiguous and collide two clips onto one
  // filename. Cheap to check while both lists are already in hand.
  const seen = new Set<string>();
  for (const page of PAGES) {
    if (seen.has(page.id)) problems.push(`Duplicate page id '${page.id}'.`);
    seen.add(page.id);
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`  [error] ${p}`);
    console.error(`\n  ${problems.length} problem(s).\n`);
    process.exit(1);
  }

  console.log(`  [ok] All ${nav.length} demo routes are registered in both places.\n`);
}

main();
