/**
 * Checks that run before anything expensive starts.
 *
 * Each one exists because it actually cost a run:
 *  - a stale server still holding a port served requests with an old API key
 *    while a freshly started one sat beside it
 *  - a placeholder OPENAI_API_KEY let every page record and fail on 401,
 *    discovered only at the end
 *  - the first request to a just-started dev server is slow enough to blow the
 *    recorder's own preflight timeout
 */
import { execSync } from 'node:child_process';
import {
  BACKEND_PORT,
  FRONTEND_PORT,
  FRONTEND_URL,
  RUNTIME_PORT,
  RUNTIME_WARM_URL,
  WARMUP_ROUTES,
  isWindows,
} from './config.mjs';

/** PIDs currently listening on a port. Empty when the port is free. */
export function listenersOnPort(port) {
  try {
    if (isWindows) {
      const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pids = out
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => pid && /^\d+$/.test(pid) && pid !== '0');
      return [...new Set(pids)];
    }
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return [...new Set(out.split(/\r?\n/).filter(Boolean))];
  } catch {
    // Non-zero exit from netstat/lsof means "nothing matched".
    return [];
  }
}

/**
 * Refuse to start on top of an already-bound port.
 *
 * Windows will happily let a second process bind a port another process is
 * already listening on, and requests then land on whichever accepts first. A
 * stale server carrying old environment variables is indistinguishable from
 * the new one, so this fails loudly instead of guessing.
 *
 * `runtime` and `frontend` share a caveat: one command (`npm run dev` in
 * frontend/) starts both, so either being busy means that command cannot be
 * run and both are treated as reused.
 */
export function assertPortsFree({ allowReuse = false } = {}) {
  const conflicts = [];
  for (const [name, port] of [
    ['backend', BACKEND_PORT],
    ['runtime', RUNTIME_PORT],
    ['frontend', FRONTEND_PORT],
  ]) {
    const pids = listenersOnPort(port);
    if (pids.length > 0) conflicts.push({ name, port, pids });
  }

  const busy = { backend: false, runtime: false, frontend: false };
  for (const c of conflicts) busy[c.name] = true;

  if (conflicts.length === 0) return busy;

  console.error('\n🔍 [Preflight] Ports already in use:');
  for (const c of conflicts) {
    console.error(`   [x] ${c.name} port ${c.port} held by PID(s): ${c.pids.join(', ')}`);
  }

  if (allowReuse) {
    console.warn(
      '   ⚠️ --allow-port-reuse given; recording against these servers and not starting new ones.\n',
    );
    return busy;
  }

  console.error(
    '\n❌ Refusing to start a second server on a busy port — a stale process may hold\n' +
      '   outdated environment variables and answer requests instead of the new one.\n' +
      '   Stop the listed PIDs, or pass --allow-port-reuse to record against them.\n',
  );
  throw new Error(`Port(s) in use: ${conflicts.map((c) => `${c.name}:${c.port}`).join(', ')}`);
}

/**
 * Confirm a usable model credential before recording anything.
 *
 * Cheap here, expensive later: without it every page records a full demo that
 * can only end in an auth error.
 *
 * Unlike the sibling repos there is no Azure branch. `_build_config()` in
 * backend/main.py constructs an `OpenAIConfig` unconditionally and reads
 * OPENAI_API_KEY / OPENAI_CHAT_MODEL_ID — nothing else. Checking for an Azure
 * endpoint here would describe a fallback this backend does not have.
 */
export async function assertModelCredentials() {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey || openaiKey.trim() === '' || openaiKey.trim() === 'sk-...') {
    throw new Error(
      'OPENAI_API_KEY is missing or still the .env.example placeholder ("sk-...").\n' +
        'Set a real key in backend/.env or the repo-root .env before recording.',
    );
  }

  // The same rule `_build_config()` enforces in backend/main.py: an OpenAI key
  // is ASCII and unbroken, so anything else means the value was mangled in
  // transit. httpx then rejects the Authorization header before the request is
  // sent, the AG-UI stream dies, the Copilot Runtime goes with it, and every
  // page reports "Failed to fetch" — three processes away from the cause.
  //
  // Nothing below prints any part of the value, not even a prefix. A secret
  // stored with a stray newline also defeats GitHub's log masking: the mask
  // matches the STORED value, so a trimmed form of it sails straight through
  // into a public log. That happened on run 33477092124 and cost a rotation.
  if (/\s/.test(openaiKey) || !/^[\x20-\x7e]*$/.test(openaiKey)) {
    throw new Error(
      'OPENAI_API_KEY contains whitespace or non-printable characters — it was\n' +
        'probably pasted with a line break. The backend refuses to start on it, so\n' +
        'recording would produce a full run of dead chats. Re-add it as a single\n' +
        'unbroken line. (The value itself is deliberately not printed.)',
    );
  }

  process.stdout.write('⏳ [Preflight] Verifying model credentials... ');
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${openaiKey}` },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 401 || res.status === 403) {
      process.stdout.write('❌\n');
      throw new Error(`OPENAI_API_KEY rejected by OpenAI (HTTP ${res.status}).`);
    }
    if (!res.ok) {
      // Rate limits or transient 5xx are not a reason to block a run.
      process.stdout.write(`⚠️ inconclusive (HTTP ${res.status}); continuing.\n`);
      return;
    }
    process.stdout.write('✅ valid\n');
  } catch (err) {
    if (err instanceof Error && /rejected by OpenAI/.test(err.message)) throw err;
    process.stdout.write('⚠️ could not reach OpenAI; continuing.\n');
  }
}

/**
 * Fetch the app's routes once before the recorder's own preflight runs, so the
 * first-load cost is not mistaken for a dead frontend.
 */
export async function warmFrontendRoutes(timeoutMs = 180000) {
  for (const route of WARMUP_ROUTES) {
    const url = `${FRONTEND_URL}${route}`;
    process.stdout.write(`⏳ [Warmup] ${route} ... `);
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(`${res.ok ? '✅' : `⚠️ HTTP ${res.status}`} (${secs}s)\n`);
    } catch {
      process.stdout.write('⚠️ timed out; recorder may hit a cold first load.\n');
    }
  }
}

/**
 * Hit the runtime's /info endpoint before recording.
 *
 * The browser posts across origins to the runtime, and that first request pays
 * for the runtime's connection to the AG2 agent. Paying it here means a broken
 * agent surfaces as a failed preflight rather than as a demo where nothing ever
 * replies.
 */
export async function warmRuntimeEndpoint(timeoutMs = 120000) {
  process.stdout.write(`⏳ [Warmup] runtime ${RUNTIME_WARM_URL} ... `);
  const started = Date.now();
  try {
    const res = await fetch(RUNTIME_WARM_URL, { signal: AbortSignal.timeout(timeoutMs) });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    process.stdout.write(`${res.ok ? '✅' : `⚠️ HTTP ${res.status}`} (${secs}s)\n`);
  } catch {
    process.stdout.write('⚠️ no response; the first prompt may pay this cost instead.\n');
  }
}
