/**
 * Pull the clips a CI recording run produced down into `videos/ci-<run-id>/`.
 *
 * `record.yml` uploads its output as a GitHub artifact, which is where it stays
 * — the clips are gitignored, so CI is the only place a full set exists after a
 * run. Watching them means downloading them, and doing that by hand means
 * finding the run, finding the artifact, unzipping it somewhere, and then
 * having no idea a week later which run the folder came from.
 *
 * Hence the `ci-<run-id>` naming: the folder carries its own provenance, sits
 * beside the local clips without colliding with them, and matches what the
 * sibling repos in this workspace already do. Local clips stay at the top of
 * `videos/`; every CI run gets its own subfolder, so two runs can be compared
 * against each other and against local.
 *
 *   npm run ci:videos              newest "Record demos" run
 *   npm run ci:videos -- 12345678  that run id
 *   npm run ci:videos -- --list    what is downloadable, without downloading
 *
 * Requires the `gh` CLI, authenticated. Everything here is a thin wrapper on it
 * rather than raw REST, so it inherits whatever auth the user already has.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RECORDER_DIR = fileURLToPath(new URL('.', import.meta.url));
const VIDEOS_DIR = join(RECORDER_DIR, 'videos');
const WORKFLOW = 'record.yml';

/** Runs `gh` and returns stdout, or exits with a message a human can act on. */
function gh(args, { allowFail = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (allowFail) return '';
    const detail = (err.stderr || err.message || '').trim();
    if (/not found|could not resolve/i.test(detail)) {
      console.error(`\n  gh could not find that. ${detail}\n`);
    } else if (/auth|login/i.test(detail)) {
      console.error(`\n  gh is not authenticated. Run: gh auth login\n`);
    } else {
      console.error(`\n  gh ${args.join(' ')} failed:\n  ${detail}\n`);
    }
    process.exit(1);
  }
}

function listRuns() {
  const raw = gh([
    'run', 'list',
    '--workflow', WORKFLOW,
    '--limit', '15',
    '--json', 'databaseId,status,conclusion,createdAt,displayTitle',
  ]);
  return JSON.parse(raw || '[]');
}

function humanSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

function main() {
  const args = process.argv.slice(2);
  const wantList = args.includes('--list');
  const explicitId = args.find((a) => /^\d+$/.test(a));

  const runs = listRuns();
  if (runs.length === 0) {
    console.error(`\n  No ${WORKFLOW} runs found. Trigger one:\n    gh workflow run ${WORKFLOW}\n`);
    process.exit(1);
  }

  if (wantList) {
    console.log(`\n=== ${WORKFLOW} runs ===`);
    for (const r of runs) {
      const state = r.status === 'completed' ? r.conclusion : r.status;
      console.log(`  ${String(r.databaseId).padEnd(12)} ${String(state).padEnd(12)} ${r.createdAt}`);
    }
    console.log('');
    return;
  }

  // Default to the newest run that actually finished. A run still in progress
  // has no artifact yet, and silently downloading the one before it would hand
  // back clips from a different commit.
  const run = explicitId
    ? runs.find((r) => String(r.databaseId) === explicitId) ?? { databaseId: explicitId }
    : runs.find((r) => r.status === 'completed');

  if (!run) {
    const pending = runs[0];
    console.error(
      `\n  The newest run (${pending.databaseId}) is still ${pending.status}. ` +
        `Wait for it, or pass an older run id.\n`,
    );
    process.exit(1);
  }

  const runId = String(run.databaseId);
  const dest = join(VIDEOS_DIR, `ci-${runId}`);

  if (existsSync(dest)) {
    console.log(`\n  videos/ci-${runId}/ already exists — refreshing it in place.`);
  }
  mkdirSync(dest, { recursive: true });

  console.log(`\n  Downloading artifacts from run ${runId}...`);
  gh(['run', 'download', runId, '--dir', dest]);

  // gh unpacks each artifact into a subdirectory named after it. One artifact
  // means one level of nesting nobody wants, so flatten that single case.
  const entries = readdirSync(dest);
  if (entries.length === 1) {
    const only = join(dest, entries[0]);
    if (statSync(only).isDirectory()) {
      for (const f of readdirSync(only)) {
        execFileSync(process.platform === 'win32' ? 'cmd' : 'mv',
          process.platform === 'win32'
            ? ['/c', 'move', '/y', join(only, f), join(dest, f)]
            : [join(only, f), join(dest, f)],
          { stdio: 'ignore' });
      }
      try { execFileSync(process.platform === 'win32' ? 'cmd' : 'rmdir',
        process.platform === 'win32' ? ['/c', 'rmdir', '/s', '/q', only] : [only],
        { stdio: 'ignore' }); } catch { /* leave the empty dir rather than fail */ }
    }
  }

  const clips = readdirSync(dest).filter((f) => f.endsWith('.webm')).sort();
  console.log(`\n=== videos/ci-${runId}/ ===`);
  for (const c of clips) {
    console.log(`  ${humanSize(statSync(join(dest, c)).size).padStart(9)}  ${c}`);
  }
  const others = readdirSync(dest).filter((f) => !f.endsWith('.webm')).sort();
  if (others.length) console.log(`  plus: ${others.join(', ')}`);
  console.log(`\n  ${clips.length} clip(s).\n`);
}

main();
