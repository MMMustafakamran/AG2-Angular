/**
 * The pipeline entry point, used identically by a developer and by CI.
 *
 * Everything runs inside this one Node process on purpose. Each `run:` step in
 * a GitHub Actions job is its own subshell, so a server started with `&` in one
 * step is reaped before the next step begins. Spawning the servers here keeps
 * them alive for as long as the recorder needs them — which is also why the
 * old record.yml had to start three servers, poll them, and record them all
 * from inside a single sprawling job.
 *
 * Two spawns, three services: `npm run dev` in frontend/ starts the Copilot
 * Runtime (server.ts, :8401) and `ng serve` (:4204) together under
 * concurrently, because Angular has no server route to host the runtime the way
 * a Next app does. The AG2 backend (:8400) is the second spawn.
 *
 * Flags:
 *   --pull               git pull before running
 *   --use-lockfile       install the committed lockfiles instead of re-resolving
 *   --skip-install       skip dependency installation entirely
 *   --ignore-doc-drift   record even if the live docs have moved (alias: --force)
 *   --allow-port-reuse   record against servers that are already running
 *   --skip-credential-check  bypass the model-credential preflight
 *
 * Anything else is forwarded to the recorder (e.g. --shard=1/3, --pages=a,b).
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checkAllDocDrift } from './check-doc-drift.mjs';
import {
  BACKEND_DIR,
  BACKEND_HEALTH_URL,
  FRONTEND_DIR,
  FRONTEND_URL,
  LOGS_DIR,
  RECORDER_DIR,
  ROOT_DIR,
  RUNTIME_HEALTH_URL,
  VIDEOS_DIR,
  isWindows,
} from './lib/config.mjs';
import { loadEnvFiles, trimInheritedCredentials } from './lib/env.mjs';
import {
  assertModelCredentials,
  assertPortsFree,
  warmRuntimeEndpoint,
} from './lib/preflight.mjs';
import { generateReport } from './lib/report.mjs';

const OWN_FLAGS = [
  '--pull',
  '--use-lockfile',
  '--skip-install',
  '--ignore-doc-drift',
  '--force',
  '--allow-port-reuse',
  '--skip-credential-check',
];

/**
 * How the frontend and recorder are installed.
 *
 * A plain `npm install`, deliberately: every install target in this repo
 * resolves under npm's real peer rules, so `--legacy-peer-deps` would only hide
 * the next genuine conflict instead of failing on it.
 *
 * By default the lockfile is dropped first, so npm resolves the newest versions
 * the ranges in package.json already allow. That is the point of these
 * recordings: they document CopilotKit, so they should be made against the
 * CopilotKit that shipped, not one pinned months ago. It is also exactly what
 * `rm -rf node_modules package-lock.json && npm install` does by hand, which is
 * how these demos have always been checked. Nothing needs deleting alongside
 * it — CI starts on a clean runner, so the lockfile is the only thing pinning
 * anything, and a caret range still cannot cross a major boundary.
 *
 * `--use-lockfile` opts back into the committed versions, for reproducing an
 * older run or bisecting a break to the dependency tree rather than the demo.
 *
 * What no run does is rewrite the ranges. Bumping the manifest is a reviewed
 * change to package.json, not something a nightly run does to itself.
 */
const NPM_INSTALL = 'npm install';

function installNodeDeps(dir, description) {
  if (shouldRefresh) {
    const lockPath = path.join(dir, 'package-lock.json');
    if (fs.existsSync(lockPath)) {
      fs.rmSync(lockPath);
      console.log(
        `   ↻ ${description}: dropped package-lock.json to resolve the ranges afresh (--use-lockfile keeps it)`,
      );
    }
  }
  runSync(NPM_INSTALL, dir, description);
}

const args = process.argv.slice(2);
const shouldPull = args.includes('--pull');
const shouldRefresh = !args.includes('--use-lockfile');
const skipInstall = args.includes('--skip-install');
const ignoreDocDrift = args.includes('--ignore-doc-drift') || args.includes('--force');
const allowPortReuse = args.includes('--allow-port-reuse');
const skipCredentialCheck = args.includes('--skip-credential-check');
// `--force` also means "record anyway" to the recorder, so it is forwarded.
const forwardArgs = args.filter((a) => !OWN_FLAGS.includes(a) || a === '--force');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  🚀 CopilotKit AG2 (Python) + Angular Automation Pipeline');
console.log('═══════════════════════════════════════════════════════════════');

let backendProc = null;
let frontendProc = null;
let logHandles = [];

function killTree(proc, signal = 'SIGTERM') {
  if (!proc || !proc.pid) return;
  try {
    if (isWindows) {
      execSync(`taskkill /pid ${proc.pid} /T /F 2>nul || exit 0`, { stdio: 'ignore' });
    } else {
      try {
        process.kill(-proc.pid, signal);
      } catch {
        proc.kill(signal);
      }
    }
  } catch {
    try {
      proc.kill(signal);
    } catch {
      // ignore
    }
  }
}

function cleanup() {
  if (backendProc || frontendProc) {
    console.log('\n🧹 Cleaning up running processes...');
  }
  if (backendProc) {
    killTree(backendProc);
    backendProc = null;
  }
  // The whole tree, not just the shell: `npm run dev` is concurrently, which
  // owns the runtime and ng serve as children. Killing the parent alone leaves
  // two servers holding 8401 and 4204, and the next run refuses to start.
  if (frontendProc) {
    killTree(frontendProc);
    frontendProc = null;
  }
  for (const fd of logHandles) {
    try {
      fs.closeSync(fd);
    } catch {
      // ignore
    }
  }
  logHandles = [];
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});
process.on('exit', cleanup);

function runSync(command, cwd, description) {
  console.log(`\n▶ [Step] ${description}...`);
  try {
    execSync(command, { cwd, stdio: 'inherit', shell: true });
  } catch (err) {
    console.error(`❌ Failed during: ${description}`);
    throw err;
  }
}

/** Same, but a failure is reported and swallowed — for the post-run steps. */
function runOptional(command, cwd, description) {
  try {
    runSync(command, cwd, description);
    return true;
  } catch (err) {
    console.warn(`⚠️ ${description} failed: ${err.message || err}`);
    return false;
  }
}

/**
 * Start a server with its output going to a file.
 *
 * Piping a server's stdio through Node deadlocks once the OS pipe buffer fills,
 * but discarding it entirely means a server that dies mid-run leaves no trace
 * at all. A file gets both: no buffer to fill, and a log to attach to the run
 * artifacts.
 */
function spawnServer(command, cwd, logName) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, logName);
  const fd = fs.openSync(logPath, 'w');
  logHandles.push(fd);

  const proc = spawn(command, {
    cwd,
    stdio: ['ignore', fd, fd],
    shell: true,
    detached: !isWindows,
  });
  return { proc, logPath };
}

function tailLog(logPath, lines = 25) {
  try {
    const content = fs.readFileSync(logPath, 'utf8').trimEnd().split(/\r?\n/);
    return content.slice(-lines).join('\n');
  } catch {
    return '(no log captured)';
  }
}

async function waitForHealth(url, name, logPath, timeoutMs = 60000) {
  const start = Date.now();
  // Whole lines, not a dotted progress line: several of these run at once.
  console.log(`⏳ Waiting for ${name} (${url})...`);
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`✅ ${name} READY (${elapsed}s)!`);
        return { ok: true, elapsedSec: Number(elapsed) };
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(`❌ ${name} TIMEOUT`);
  console.error(`\n──── last lines of ${path.basename(logPath)} ────`);
  console.error(tailLog(logPath));
  console.error('────────────────────────────────────────────\n');
  throw new Error(`Timeout waiting for ${name} at ${url}. See ${logPath}`);
}

async function main() {
  const reportData = {
    success: false,
    driftResult: null,
    health: {},
    error: null,
    args: forwardArgs,
    refreshed: shouldRefresh,
  };

  try {
    // 0. Live doc drift
    console.log('▶ [Step 0] Checking for live documentation drift against doc-snapshot...');
    const driftResult = await checkAllDocDrift();
    reportData.driftResult = driftResult;

    if (driftResult.drifted) {
      console.log('\n🚨 [DOC DRIFT DETECTED] Upstream documentation has changed on these pages:');
      console.log('───────────────────────────────────────────────────────────────────────────');
      for (const p of driftResult.driftedPages) {
        console.log(` • [${p.severity}] ${p.docPath}`);
        if (p.oldHash && p.newHash) {
          console.log(`   Hash: ${p.oldHash} ➔ ${p.newHash} (${p.file})`);
        }
      }
      console.log('───────────────────────────────────────────────────────────────────────────');

      if (!ignoreDocDrift) {
        console.log('⚠️ Halting so you can review the doc changes first.');
        console.log('👉 `npm run drift:sync` rewrites the snapshot, the manifest and CHANGELOG.md.');
        console.log('👉 To run anyway, pass `--ignore-doc-drift` or `--force`.');
        generateReport(reportData);
        process.exit(2);
      }
      console.log('⚠️ --ignore-doc-drift provided. Proceeding anyway...\n');
    } else {
      console.log(
        `✅ [Doc Drift Check]: All ${driftResult.total} doc pages match the local snapshot.\n`,
      );
    }

    // 1. Preflight — fail before spending time on installs and recordings.
    const envFiles = loadEnvFiles();
    if (envFiles.length > 0) {
      console.log(`🔑 [Preflight] Loaded environment from: ${envFiles.join(', ')}`);
    }
    const trimmedVars = trimInheritedCredentials();
    if (trimmedVars.length > 0) {
      console.log(
        `🔑 [Preflight] Trimmed surrounding whitespace from: ${trimmedVars.join(', ')}` +
          ' — worth fixing at the source, a stored secret is keeping a stray newline.',
      );
    }
    // `busy` records which ports were already served. With --allow-port-reuse
    // those servers are reused as-is; starting a second one on the same port is
    // precisely the failure this guard exists to prevent.
    const busy = assertPortsFree({ allowReuse: allowPortReuse });
    if (!skipCredentialCheck) {
      await assertModelCredentials();
    }

    // 2. Git pull
    if (shouldPull) {
      runSync('git pull', ROOT_DIR, 'Updating repository (git pull)');
    }

    // 3. Dependencies
    if (!skipInstall) {
      runSync(
        // uv's half of the same default. `uv sync --upgrade` re-resolves within
        // the ranges pyproject.toml already declares, which is what dropping
        // package-lock.json does on the npm side; uv.lock is rewritten in place
        // rather than deleted.
        //
        // No --prerelease=allow. Neither lock holds a prerelease, so the flag
        // buys nothing on a normal sync, and on a re-resolve it is actively
        // wrong: on a sibling repo it let uv pick httpx==1.0.dev5, whose module
        // has no AsyncClient, and the agent died at import. A prerelease that
        // becomes genuinely required belongs pinned in pyproject.toml, where it
        // is visible.
        shouldRefresh ? 'uv sync --upgrade' : 'uv sync --locked',
        BACKEND_DIR,
        'Syncing Backend Dependencies (uv sync)',
      );

      installNodeDeps(FRONTEND_DIR, 'Installing Frontend Dependencies');
      installNodeDeps(RECORDER_DIR, 'Installing Autorecorder Dependencies');

      // Written here, after the installs and before anything is recorded, so
      // the file the Quickstart clip puts on screen names the versions this run
      // actually resolved rather than the ranges package.json declares.
      //
      // This repo already owns that generator (frontend/scripts/write-versions.ts,
      // `npm run gen:versions`) and the recorder's doctor calls the same script,
      // so it is invoked rather than reimplemented under ci/ — one writer of
      // frontend/VERSIONS.md, not two that can disagree.
      runOptional('npm run gen:versions', FRONTEND_DIR, 'Writing frontend/VERSIONS.md');
    }

    // 4. Servers — skipped for any port already being served.
    let backendLog = path.join(LOGS_DIR, 'backend.log');
    if (busy.backend) {
      console.log('\n▶ [Step] AG2 backend already running; reusing it.');
    } else {
      console.log('\n▶ [Step] Starting AG2 Backend...');
      const backend = spawnServer('uv run main.py', BACKEND_DIR, 'backend.log');
      backendProc = backend.proc;
      backendLog = backend.logPath;
    }

    // One command, both processes — so either port being held means this
    // command cannot run, and both are treated as already served.
    let frontendLog = path.join(LOGS_DIR, 'frontend.log');
    if (busy.frontend || busy.runtime) {
      console.log('▶ [Step] Copilot Runtime / Angular dev server already running; reusing them.');
    } else {
      console.log('▶ [Step] Starting Copilot Runtime + Angular dev server (npm run dev)...');
      const frontend = spawnServer('npm run dev', FRONTEND_DIR, 'frontend.log');
      frontendProc = frontend.proc;
      frontendLog = frontend.logPath;
    }

    // 5. Health — the backend first: the runtime's /info is only meaningful
    // once there is an agent behind it.
    reportData.health.backend = (
      await waitForHealth(BACKEND_HEALTH_URL, 'AG2 Backend', backendLog, 60000)
    ).elapsedSec;
    reportData.health.runtime = (
      await waitForHealth(RUNTIME_HEALTH_URL, 'Copilot Runtime', frontendLog, 60000)
    ).elapsedSec;
    reportData.health.frontend = (
      await waitForHealth(FRONTEND_URL, 'Angular Frontend', frontendLog, 180000)
    ).elapsedSec;

    // 6. Warm the routes and the runtime so the recorder's own preflight is not
    // racing a first load.
    await warmRuntimeEndpoint();

    // 7. Record
    //
    // The recorder writes videos/RECORD_RESULTS.json and the report reads it.
    // Drop any earlier one first, so a run that dies before recording cannot
    // report yesterday's results as today's.
    fs.rmSync(path.join(VIDEOS_DIR, 'RECORD_RESULTS.json'), { force: true });
    console.log('\n▶ [Step] Running Autorecorder...');
    const recorderCmd =
      forwardArgs.length > 0 ? `npm run record -- ${forwardArgs.join(' ')}` : 'npm run record';
    runSync(recorderCmd, RECORDER_DIR, 'Executing Autorecorder');

    reportData.success = true;
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  🎉 Automation completed successfully! All videos recorded.');
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (err) {
    reportData.error = err.message || String(err);
    console.error('\n❌ Automation failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    // Muxed here, in the process that produced the video, and exactly once.
    // The mapping lives in autorecorder/mux.mjs — this repo's Shared State
    // narration is its own, longer track rather than the one the sibling
    // Angular repos share, and that table is the place saying so. Duplicating
    // it under ci/ would give the run two mappings that can disagree.
    //
    // Optional on purpose: a missing ffmpeg is a skip inside that script, and a
    // failed mux must not turn a successful recording run red.
    runOptional('npm run mux', RECORDER_DIR, 'Muxing narration tracks');

    // Deliberately NOT the recording manifest. `npm run manifest` rewrites
    // manifest.json against whatever clips are on disk, so running it in a
    // shard — which recorded a quarter of the pages — would mark the other
    // three quarters missing. The consolidate job runs it once over the merged
    // set instead.
    generateReport(reportData);
    cleanup();
  }
}

main();
