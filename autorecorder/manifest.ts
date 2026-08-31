/**
 * Recording manifest — what is on disk, when it was made, and whether it still
 * matches the code it shows.
 *
 * The clips themselves are deliberately not in git (see `videos/.gitignore`):
 * a clip per page at ~5MB, rewritten on every run, is not something version
 * control should carry. But that leaves no way to tell a clip recorded five minutes ago from one
 * recorded last month against a UI that has since changed, because every run
 * overwrites the same filenames in place.
 *
 * So the binaries stay out and this stays in: a small committed file recording,
 * per clip, when it was made, what it hashes to, and the state of the source
 * files it puts on screen. `git diff` on the manifest then shows exactly what a
 * run changed, and a stale clip announces itself instead of being discovered by
 * someone watching a video of code that no longer exists.
 *
 *   npm run manifest         rewrite manifest.json + MANIFEST.md, print the table
 *   npm run manifest:check   print only; exit 1 if anything is missing or stale
 *
 * Run it right after `npm run record` — that is what makes the recorded source
 * hash mean "the source as it was when this clip was made".
 *
 * ── Why this is a sibling of cli.ts rather than a flag on it ────────────────
 * `package.json` already shipped `"manifest": "tsx cli.ts --manifest"`, but
 * `cli.ts` never implemented `--manifest` and does not list it in GLOBAL_FLAGS,
 * so that script fell through to the page-name filter, matched nothing and
 * exited 1. `cli.ts` is frozen by ADAPT.md, so the feature lands here and the
 * script now points at this file. The dangling flag is worth reporting upstream.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGES } from './config/pages.config';
import { PROJECT } from './config/project.config';
import { type PageRecordConfig } from './core/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const VIDEOS_DIR = join(__dirname, 'videos');
const JSON_PATH = join(VIDEOS_DIR, 'manifest.json');
const MD_PATH = join(VIDEOS_DIR, 'MANIFEST.md');

/**
 * `new` and `current` describe a clip that matches its sources; the other three
 * are the ones worth acting on. Order matters — `status()` reports the first
 * that applies, worst first.
 */
type Status = 'missing' | 'stale' | 'drifted' | 'new' | 'current';

const LABEL: Record<Status, string> = {
  missing: '❌ missing',
  stale: '⚠️ stale',
  drifted: '⚠️ drifted',
  new: '🆕 new',
  current: '✅ current',
};

const EXPLAIN: Record<Status, string> = {
  missing: 'registered page with no clip on disk — record it',
  stale: 'a source file changed after the clip was recorded — re-record',
  drifted: 'source content differs from what was recorded (mtimes unreliable after a clone)',
  new: 'the clip changed since the last manifest — this run re-recorded it',
  current: 'clip matches the code it shows',
};

interface ClipEntry {
  order: number;
  id: string;
  name: string;
  file: string;
  /** Clip mtime, ISO. Absent when the clip does not exist. */
  recordedAt?: string;
  bytes?: number;
  /** First 12 hex chars — enough to spot a change, short enough to read. */
  sha256?: string;
  /** Repo-relative files this clip puts on screen. */
  sources: string[];
  /** Hash of those files' contents plus the page definition. */
  sourceSha: string;
  status: Status;
  /** Which source made it stale/drifted; omitted otherwise. */
  because?: string;
}

interface Manifest {
  generatedAt: string;
  framework: string;
  videoPrefix: string;
  clips: Record<string, ClipEntry>;
}

const sha = (buf: Buffer | string): string =>
  createHash('sha256').update(buf).digest('hex');

/**
 * Every file the video shows: the primary IDE file plus each extra tab.
 *
 * Deliberately taken from the page definition rather than guessed from the
 * route. For most pages the IDE file *is* the demo page, but `inspector` leads
 * with `providers.tsx` and `human-in-the-loop` with `global-frontend-tools.tsx`
 * — and those are exactly the files whose drift should invalidate the clip.
 */
function sourcesFor(page: PageRecordConfig): string[] {
  return [page.ideFile, ...(page.extraTabs ?? []).map((t) => t.filePath)];
}

/**
 * Fingerprint of everything that determines what the clip should look like:
 * the source files, and the page definition itself — a changed prompt or line
 * range alters the recording just as surely as an edit to the code does.
 */
function fingerprint(page: PageRecordConfig, sources: string[]): string {
  const parts = [
    JSON.stringify({
      docPath: page.docPath,
      route: page.route,
      ideFile: page.ideFile,
      startLine: page.startLine,
      endLine: page.endLine,
      extraTabs: page.extraTabs ?? [],
      prompt: page.prompt,
      prompts: page.prompts ?? null,
    }),
  ];
  for (const rel of sources) {
    const abs = join(ROOT, rel);
    parts.push(`${rel}:${existsSync(abs) ? sha(readFileSync(abs)) : 'MISSING'}`);
  }
  return sha(parts.join('\n')).slice(0, 12);
}

function readPrevious(): Manifest | null {
  if (!existsSync(JSON_PATH)) return null;
  try {
    return JSON.parse(readFileSync(JSON_PATH, 'utf-8')) as Manifest;
  } catch {
    console.warn(`   [!] ${JSON_PATH} is unreadable; treating every clip as new.`);
    return null;
  }
}

function buildEntry(page: PageRecordConfig, previous: Manifest | null): ClipEntry {
  const sources = sourcesFor(page);
  const sourceSha = fingerprint(page, sources);
  const prior = previous?.clips[page.id];

  const base = {
    order: page.order,
    id: page.id,
    name: page.name,
    file: `${page.filename}.webm`,
    sources,
    sourceSha,
  };

  const clipPath = join(VIDEOS_DIR, base.file);
  if (!existsSync(clipPath)) {
    return { ...base, status: 'missing' };
  }

  const stat = statSync(clipPath);
  const entry: ClipEntry = {
    ...base,
    recordedAt: stat.mtime.toISOString(),
    bytes: stat.size,
    sha256: sha(readFileSync(clipPath)).slice(0, 12),
    status: 'current',
  };

  // Primary signal: a source edited after the clip was written. Stateless, so it
  // works on the very first run with no previous manifest to compare against.
  const newer = sources
    .map((rel) => ({ rel, abs: join(ROOT, rel) }))
    .filter(({ abs }) => existsSync(abs) && statSync(abs).mtimeMs > stat.mtimeMs)
    .map(({ rel }) => rel);

  if (newer.length > 0) {
    entry.status = 'stale';
    entry.because = `${newer[0]} modified after recording${
      newer.length > 1 ? ` (+${newer.length - 1} more)` : ''
    }`;
    return entry;
  }

  // Secondary: a fresh clone resets every mtime to checkout time, which hides
  // real drift from the check above. The stored hash survives that.
  if (prior && prior.sourceSha !== sourceSha) {
    entry.status = 'drifted';
    entry.because = `source hash ${prior.sourceSha} -> ${sourceSha} since last manifest`;
    return entry;
  }

  // The "which videos are new" answer: content differs from the last manifest.
  if (!prior || prior.sha256 !== entry.sha256) {
    entry.status = 'new';
  }

  return entry;
}

function renderMarkdown(manifest: Manifest, entries: ClipEntry[]): string {
  const rows = entries
    .map((e) => {
      const when = e.recordedAt ? e.recordedAt.replace('T', ' ').slice(0, 16) : '—';
      const size = e.bytes ? `${(e.bytes / 1024 / 1024).toFixed(1)} MB` : '—';
      const note = e.because ?? '';
      return `| ${String(e.order).padStart(2, '0')} | \`${e.file}\` | ${when} | ${size} | ${LABEL[e.status]} | ${note} |`;
    })
    .join('\n');

  const counts = (['missing', 'stale', 'drifted', 'new', 'current'] as Status[])
    .map((s) => ({ s, n: entries.filter((e) => e.status === s).length }))
    .filter(({ n }) => n > 0)
    .map(({ s, n }) => `${n} ${s}`)
    .join(' · ');

  return `# Recording manifest — ${manifest.framework}

<!-- Generated by \`npm run manifest\`. Do not edit by hand. -->

The \`.webm\` files are **not** in git; this file is how their state is tracked.
Regenerate it after every \`npm run record\`, and commit it — the diff is the
record of what that run changed.

Generated **${manifest.generatedAt.replace('T', ' ').slice(0, 16)}** · ${counts}

| # | Clip | Recorded | Size | Status | Note |
|---|------|----------|------|--------|------|
${rows}

**Status meanings**

${(['missing', 'stale', 'drifted', 'new', 'current'] as Status[])
  .map((s) => `- ${LABEL[s]} — ${EXPLAIN[s]}`)
  .join('\n')}

A clip is judged against the files it actually puts on screen (its \`ideFile\` and
any extra tabs) plus its page definition, so changing a prompt or a highlighted
line range marks the clip stale just as an edit to the code does.
`;
}

function main(): void {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  const previous = readPrevious();
  const entries = PAGES.map((page) => buildEntry(page, previous));

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    framework: PROJECT.frameworkLabel,
    videoPrefix: PROJECT.videoPrefix,
    clips: Object.fromEntries(entries.map((e) => [e.id, e])),
  };

  console.log(`\n=== RECORDING MANIFEST ===`);
  console.log(`  project : ${PROJECT.frameworkLabel} (${PROJECT.framework})`);
  console.log(`  videos  : ${VIDEOS_DIR}`);
  console.log(`  mode    : ${checkOnly ? 'check only (nothing written)' : 'writing manifest'}\n`);

  for (const e of entries) {
    const when = e.recordedAt ? e.recordedAt.replace('T', ' ').slice(0, 16) : '—'.padEnd(16);
    console.log(
      `  ${LABEL[e.status].padEnd(11)} ${String(e.order).padStart(2, '0')} ${e.file.padEnd(38)} ${when}`,
    );
    if (e.because) console.log(`${' '.repeat(15)}· ${e.because}`);
  }

  const missing = entries.filter((e) => e.status === 'missing');
  const stale = entries.filter((e) => e.status === 'stale' || e.status === 'drifted');
  const fresh = entries.filter((e) => e.status === 'new');

  console.log(
    `\n  ${entries.length} registered · ${fresh.length} new this run · ` +
      `${stale.length} needing a re-record · ${missing.length} never recorded`,
  );

  if (!checkOnly) {
    writeFileSync(JSON_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    writeFileSync(MD_PATH, renderMarkdown(manifest, entries), 'utf-8');
    console.log(`  Wrote videos/manifest.json and videos/MANIFEST.md — commit both.\n`);
  } else if (missing.length > 0 || stale.length > 0) {
    console.log(`  Recordings are out of date. Re-record the pages listed above.\n`);
    process.exit(1);
  } else {
    console.log(`  Every clip matches the code it shows.\n`);
  }
}

main();
