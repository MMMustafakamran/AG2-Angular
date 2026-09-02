/**
 * Pull the clips a CI recording run produced down into `videos/ci-<run-id>/`.
 *
 * The pipeline uploads its output as GitHub artifacts, which is where they stay
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
 *   npm run ci:videos              newest pipeline run
 *   npm run ci:videos -- 12345678  that run id
 *   npm run ci:videos -- --list    what is downloadable, without downloading
 *
 * A pipeline run publishes several artifacts — `<run>-drift`, three
 * `<run>-shard-N`, and the consolidated `<run>` holding every clip and the
 * manifest. Only the last is downloaded: the shards duplicate its clips, and
 * pulling all five would land five folders where one set of videos was wanted.
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
const WORKFLOW = 'daily-recorder.yml';

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

/**
 * The consolidated artifact for a run: the one whose name carries no suffix.
 *
 * A pipeline run publishes `<name>-drift`, `<name>-shard-1..3` and `<name>`.
 * The last holds every clip from every shard plus the manifest, so it is the
 * only one worth downloading; taking all of them would unpack five folders and
 * three duplicate copies of each clip.
 *
 * Returns null when nothing matches — an in-progress run, or one that stopped
 * at the drift gate and therefore never recorded anything.
 */
function consolidatedArtifact(runId) {
  const raw = gh(
    ['api', `repos/{owner}/{repo}/actions/runs/${runId}/artifacts`, '--jq', '.artifacts[].name'],
    { allowFail: true },
  );
  const names = raw.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    console.error(`\n  Run ${runId} published no artifacts.\n`);
    return null;
  }
  const consolidated = names.find((n) => !/-drift$|-shard-\d+$/.test(n));
  if (!consolidated) {
    console.error(
      `\n  Run ${runId} published only ${names.join(', ')} — no consolidated` +
        `\n  recordings artifact, so this run never got past the drift gate.\n`,
    );
    return null;
  }
  return consolidated;
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

  const artifact = consolidatedArtifact(runId);
  if (!artifact) process.exit(1);

  console.log(`\n  Downloading ${artifact} from run ${runId}...`);
  // `--name` unpacks that one artifact directly into --dir. Without it gh
  // creates a subdirectory per artifact, and this run has five.
  gh(['run', 'download', runId, '--dir', dest, '--name', artifact]);

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
