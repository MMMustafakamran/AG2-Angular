/**
 * Version watch — read-only reporting on dependency drift.
 *
 * Two questions this answers that a recording run cannot:
 *
 *   1. What resolved TODAY?  The nightly drops the lockfiles and re-resolves
 *      (ci/automate.mjs), so the versions under test move on their own. The
 *      snapshot written here is committed, which makes
 *      `git log -p ci/resolved-versions.json` the timeline: when a recording
 *      breaks, one diff says which packages moved overnight.
 *
 *   2. What is available but OUT OF REACH?  Re-resolving only ever reaches the
 *      range boundary declared in package.json. Everything interesting to this
 *      repo sits past it — @copilotkit/angular exact-pins @copilotkit/core,
 *      the @ag-ui/* ranges are 0.0.x (where ^ means exact), and Angular's
 *      peerDependencies forbid newer TypeScript.
 *
 * Outdated packages are classified rather than listed, because only one of the
 * three causes is ours to act on. npm itself decides: a --dry-run install of
 * <pkg>@latest that fails with ERESOLVE is blocked by a peer range or an exact
 * pin somewhere in the tree; one that succeeds is simply a range we have not
 * bumped. See ci/VERSION-WATCH.md for the reasoning.
 *
 * Usage:
 *   node ci/check-versions.mjs             report to stdout (markdown)
 *   node ci/check-versions.mjs --snapshot  also rewrite ci/resolved-versions.json
 *
 * This script never edits package.json or a lockfile.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const AUTORECORDER_DIR = path.join(ROOT_DIR, 'autorecorder');
const SNAPSHOT_PATH = path.join(__dirname, 'resolved-versions.json');

/**
 * Packages whose pins we probe directly: the upstream we do not control.
 * `@ag-ui/client` earns its place beside the CopilotKit pair because it is the
 * bridge this repo is built on — it is the only direct @ag-ui dependency the
 * frontend declares (server.ts constructs its HttpAgent), and everything else
 * @ag-ui arrives underneath @copilotkit/runtime.
 */
const UPSTREAM_PROBES = ['@copilotkit/angular', '@copilotkit/runtime', '@ag-ui/client'];
/** Packages worth checking for multiple copies: the ones that carry protocol. */
const FRAGMENTATION_WATCH = ['@ag-ui/client', '@ag-ui/core', '@copilotkit/core'];

const out = [];
const say = (line = '') => out.push(line);

/**
 * npm has to go through a shell here. On Windows `npm` is a .cmd shim, and
 * since the CVE-2024-27980 mitigation Node refuses to execFile one (EINVAL) —
 * which fails silently enough to read as "nothing is outdated". Every argument
 * below is a literal from this file, never user input, so quoting them is
 * sufficient. Getting this wrong is why `run` reports text on failure too:
 * npm signals both "things are outdated" and "resolution failed" with exit
 * codes, so the output matters more than the status.
 */
function run(args, cwd = ROOT_DIR) {
  const cmd = ['npm', ...args].map((a) => (/^[\w.@/^~=<>-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, text: stdout, stdout };
  } catch (err) {
    const stdout = err.stdout || '';
    return { ok: false, text: `${stdout}${err.stderr || ''}`, stdout };
  }
}

const npm = (args, cwd) => run(args, cwd);

/** Returns null when the command produced nothing parseable — distinct from `{}`. */
function npmJson(args, cwd) {
  const { text } = npm(args, cwd);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 1. Classify what is outdated
 * ------------------------------------------------------------------ */

/**
 * Ask npm whether upgrading to `latest` is even legal in this tree. A dry run
 * with --package-lock-only touches no files; ERESOLVE means some peer range or
 * exact pin forbids it, and the message names the package doing the forbidding.
 */
function classify(pkg, dir) {
  const { ok, text } = npm(
    ['install', `${pkg}@latest`, '--dry-run', '--package-lock-only', '--no-audit', '--no-fund'],
    dir,
  );
  if (ok) return { bucket: 'ours', blocker: null };

  const peer = text.match(/peer\s+(\S+)@"([^"]+)"\s+from\s+(\S+@\S+)/);
  if (peer) return { bucket: 'peer', blocker: `${peer[3]} requires ${peer[1]}@${peer[2]}` };

  if (/ERESOLVE/.test(text)) {
    const conflict = text.match(/Could not resolve dependency:\s*\n[^\n]*?(\S+@\S+)/);
    return { bucket: 'pinned', blocker: conflict?.[1] ? `conflicts with ${conflict[1]}` : 'ERESOLVE (see job log)' };
  }
  return { bucket: 'unknown', blocker: text.split('\n').find((l) => l.trim()) || 'install failed' };
}

function reportOutdated(label, dir) {
  const data = npmJson(['outdated', '--json'], dir);
  say(`### ${label}`);
  say();

  // A failed probe must never read as an all-clear: silence here would look
  // exactly like "nothing is outdated", which is the one lie this job cannot tell.
  if (data === null) {
    say('⚠️ **`npm outdated` produced no parseable output — this check did not run.**');
    say('Treat this as unknown, not as clean.');
    say();
    return;
  }

  const rows = Object.entries(data).map(([name, raw]) => ({
    name,
    ...(Array.isArray(raw) ? raw[0] : raw),
  }));
  if (rows.length === 0) {
    say('Everything is at the newest version its range allows, and nothing newer exists.');
    say();
    return;
  }

  // Where wanted === latest the newest release is already inside our range, so
  // the nightly's re-resolve picks it up unprompted. Nothing to decide, and no
  // reason to spend a dry-run install on it — only what sits PAST the range
  // boundary needs classifying.
  const withinRange = rows.filter((r) => r.wanted === r.latest);
  const beyondRange = rows.filter((r) => r.wanted !== r.latest);

  const buckets = { ours: [], peer: [], pinned: [], unknown: [] };
  for (const r of beyondRange) {
    const { bucket, blocker } = classify(r.name, dir);
    buckets[bucket].push({ ...r, blocker });
  }

  if (withinRange.length) {
    say(`<details><summary>${withinRange.length} package(s) the next re-resolve picks up on its own — no action</summary>`);
    say();
    for (const r of withinRange) say(`- \`${r.name}\` → ${r.latest}`);
    say();
    say('</details>');
    say();
  }

  const table = (rows) => {
    say('| Package | Current | Wanted | Latest |');
    say('|---|---|---|---|');
    for (const r of rows) {
      say(`| \`${r.name}\` | ${r.current || '—'} | ${r.wanted || '—'} | ${r.latest || '—'} |`);
    }
    say();
  };

  if (buckets.ours.length) {
    say('**Ours to bump.** Nothing in the tree forbids these; the range in');
    say('`package.json` is simply behind. Note that a `^0.0.x` range is exact, so');
    say('`npm update` will not move it — these need a hand edit on a branch.');
    say();
    table(buckets.ours);
  }

  if (buckets.pinned.length) {
    say('**Blocked by an upstream pin.** Not fixable here — this is a finding to');
    say('report to the upstream project, not a chore.');
    say();
    for (const r of buckets.pinned) {
      say(`- \`${r.name}\` ${r.current || '?'} → ${r.latest} — ${r.blocker}`);
    }
    say();
  }

  if (buckets.peer.length) {
    say('<details><summary>Blocked by a peerDependency range (correct as-is — do not bump)</summary>');
    say();
    for (const r of buckets.peer) {
      say(`- \`${r.name}\` held at ${r.current || '?'} — ${r.blocker}`);
    }
    say();
    say('</details>');
    say();
  }

  if (buckets.unknown.length) {
    say('**Could not classify** (treat as needing a look):');
    say();
    for (const r of buckets.unknown) {
      say(`- \`${r.name}\` → ${r.latest} — ${r.blocker}`);
    }
    say();
  }
}

/* ------------------------------------------------------------------ *
 * 2. Probe the pins upstream declares
 * ------------------------------------------------------------------ */

/**
 * `npm view <pkg> <field> --json` does not answer with one shape. It can return
 * the object, or that object wrapped in a single-element array — which reads as
 * `{"0": {...}}` to Object.entries and quietly renders as "no pins declared".
 * Returns null only when the probe produced nothing, so the caller can say
 * unknown instead of clean.
 */
function viewObject(pkg, field) {
  const { ok, stdout } = npm(['view', pkg, field, '--json']);
  if (!ok) return null;               // 404, network, auth — a failed probe
  if (!stdout.trim()) return {};      // succeeded and the field is simply absent
  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return null;
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'object') return {};
  // `npm view --json` prints its error object to STDOUT and it parses cleanly,
  // so a 404 would otherwise arrive here as a well-formed object with no pins
  // in it — and render as "no pins declared". That is the all-clear lie.
  if ('error' in value) return null;
  return value;
}

function reportUpstreamPins() {
  say('### Upstream pins');
  say();
  say('What the newest published upstream release forces on its consumers.');
  say('`npm outdated` cannot see these: they are transitive, so they never appear');
  say('as something we asked for.');
  say();

  for (const pkg of UPSTREAM_PROBES) {
    // .stdout, not .text: on a failed lookup the error banner lives on stderr
    // and would otherwise be printed as if it were a version number.
    const probe = npm(['view', pkg, 'version']);
    const latest = probe.ok ? probe.stdout.trim() : '';
    const deps = viewObject(pkg, 'dependencies');
    const peers = viewObject(pkg, 'peerDependencies');
    const interesting = (obj) => Object.entries(obj || {}).filter(([d]) => /^@(copilotkit|ag-ui)\//.test(d));
    const notable = interesting(deps);
    const notablePeers = interesting(peers);

    say(`**\`${pkg}\`** — latest \`${latest || 'unknown'}\``);
    say();
    // A null from either probe means the registry read failed, not that the
    // package declares nothing. Saying "no pins" there would be the same
    // all-clear lie the outdated check guards against.
    if (deps === null || peers === null) {
      say('- ⚠️ **could not read this package from the registry — unknown, not clean**');
      say();
      continue;
    }
    if (notable.length === 0 && notablePeers.length === 0) {
      say('- no CopilotKit or AG-UI pins declared');
    }
    for (const [dep, range] of notable) {
      const depLatest = npm(['view', dep, 'version']).text.trim();
      // Compare versions, not strings: "~0.5.0" against "0.5.0" is not drift.
      // A range with a modifier can still reach newer patches on its own, so
      // only an exact pin genuinely holds a consumer back.
      const exact = /^\d/.test(range);
      const behind = depLatest && exact && range !== depLatest ? `  ← latest is ${depLatest}` : '';
      const note = !exact && depLatest && range.replace(/^[\^~]/, '') !== depLatest ? '  (range, resolves freely)' : '';
      say(`- \`${dep}\`: \`${range}\`${behind}${note}`);
    }
    // A peer range constrains us exactly as hard as a dependency pin, but it is
    // satisfied out of OUR tree — so it surfaces as our version being wrong
    // rather than as upstream holding something back. Name it as upstream's.
    for (const [dep, range] of notablePeers) {
      say(`- \`${dep}\`: \`${range}\`  (peer — satisfied from our tree)`);
    }
    say();
  }
}

/* ------------------------------------------------------------------ *
 * 3. Multiple copies of one package in the tree
 * ------------------------------------------------------------------ */

function reportFragmentation() {
  say('### Protocol fragmentation');
  say();
  say('npm resolves conflicting pins by nesting private copies. More than one');
  say('version of a wire-protocol package means the layers are not speaking the');
  say('same dialect — which is the class of problem this harness exists to find.');
  say();

  const lockPath = path.join(FRONTEND_DIR, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    say('_No frontend lockfile present; skipped._');
    say();
    return;
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  for (const pkg of FRAGMENTATION_WATCH) {
    const copies = new Map();
    for (const [nodePath, meta] of Object.entries(lock.packages || {})) {
      if (!nodePath.endsWith(`node_modules/${pkg}`) || !meta.version) continue;
      // Split on the node_modules boundaries, not on every slash — scoped names
      // contain one, and "@ag-ui > mcp-middleware" is not a nesting path.
      const owner = nodePath
        .slice(0, -`node_modules/${pkg}`.length)
        .split('node_modules/')
        .map((seg) => seg.replace(/\/$/, ''))
        .filter(Boolean)
        .join(' > ');
      if (!copies.has(meta.version)) copies.set(meta.version, []);
      copies.get(meta.version).push(owner || '(top level)');
    }
    if (copies.size === 0) continue;

    const flag = copies.size > 1 ? '⚠️' : '✅';
    say(`${flag} \`${pkg}\` — ${copies.size} version${copies.size > 1 ? 's' : ''} in the tree`);
    for (const [version, owners] of [...copies].sort()) {
      const shown = owners.slice(0, 4).join(', ');
      const rest = owners.length > 4 ? `, +${owners.length - 4} more` : '';
      say(`  - \`${version}\` — ${shown}${rest}`);
    }
  }
  say();
}

/* ------------------------------------------------------------------ *
 * 4. Snapshot — the timeline
 * ------------------------------------------------------------------ */

function collectResolved() {
  const resolved = { frontend: {}, autorecorder: {}, backend: {} };

  for (const [key, dir] of [['frontend', FRONTEND_DIR], ['autorecorder', AUTORECORDER_DIR]]) {
    const lockPath = path.join(dir, 'package-lock.json');
    if (!fs.existsSync(lockPath)) continue;
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    for (const [nodePath, meta] of Object.entries(lock.packages || {})) {
      if (!nodePath || !meta.version) continue;
      resolved[key][nodePath.replace(/^node_modules\//, '')] = meta.version;
    }
  }

  // uv.lock is TOML; the name/version pairs are all this needs, so read them
  // directly rather than pulling in a parser for two fields.
  const uvLock = path.join(BACKEND_DIR, 'uv.lock');
  if (fs.existsSync(uvLock)) {
    const text = fs.readFileSync(uvLock, 'utf8');
    for (const block of text.split(/^\[\[package\]\]$/m).slice(1)) {
      const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
      if (name && version) resolved.backend[name] = version;
    }
  }

  for (const key of Object.keys(resolved)) {
    resolved[key] = Object.fromEntries(
      Object.entries(resolved[key]).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return resolved;
}

function diffAgainstSnapshot(current) {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  const previous = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const changes = [];
  for (const scope of Object.keys(current)) {
    const before = previous[scope] || {};
    const after = current[scope];
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[name] === after[name]) continue;
      if (!before[name]) changes.push({ scope, name, from: '—', to: after[name] });
      else if (!after[name]) changes.push({ scope, name, from: before[name], to: '—' });
      else changes.push({ scope, name, from: before[name], to: after[name] });
    }
  }
  return { changes, recordedAt: previous.recordedAt };
}

function reportSnapshot(write) {
  const resolved = collectResolved();
  const diff = diffAgainstSnapshot(resolved);

  say('### What moved since the last run');
  say();
  if (!diff) {
    say('No previous snapshot — this run establishes the baseline.');
  } else if (diff.changes.length === 0) {
    say(`Nothing. Identical to the snapshot taken ${diff.recordedAt || 'previously'}.`);
  } else {
    const n = diff.changes.length;
    say(`${n} package${n === 1 ? '' : 's'} moved since ${diff.recordedAt || 'the last snapshot'}.`);
    say('If a recording broke today and did not yesterday, it is in this list.');
    say();
    say('| Scope | Package | From | To |');
    say('|---|---|---|---|');
    for (const c of diff.changes.slice(0, 60)) {
      say(`| ${c.scope} | \`${c.name}\` | ${c.from} | ${c.to} |`);
    }
    if (n > 60) say(`| … | _+${n - 60} more — see the committed diff_ | | |`);
  }
  say();

  if (write) {
    const payload = { recordedAt: new Date().toISOString(), ...resolved };
    fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    say('_Snapshot written to `ci/resolved-versions.json`._');
    say();
  }
}

/* ------------------------------------------------------------------ */

const snapshot = process.argv.includes('--snapshot');

say('## 📦 Version watch');
say();
say('Read-only. This never edits `package.json` or a lockfile.');
say();
reportSnapshot(snapshot);
reportOutdated('Frontend', FRONTEND_DIR);
reportUpstreamPins();
reportFragmentation();

process.stdout.write(`${out.join('\n')}\n`);
