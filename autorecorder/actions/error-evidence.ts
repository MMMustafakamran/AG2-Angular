import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type Page } from 'playwright';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { closeNotepad, openNotepad, typeInNotepad } from '../core/overlays/notepad';

/**
 * Puts a take's real errors on camera, in the places a developer would look.
 *
 *   1. The Next.js dev overlay — the real one, opened by clicking its own
 *      "Issues" badge. Whatever Next caught (a thrown render error, a
 *      `console.error` from CopilotKit) is shown as Next shows it.
 *   2. The dev server's terminal — the lines the server logged during this take,
 *      read from its log file and replayed in a terminal window. This is where
 *      the platform's own error codes live (`LEARNING_CONTAINER_NOT_FOUND`,
 *      `MEMORY_NOT_ENTITLED`); the browser only ever sees the runtime's summary.
 *   3. Notepad — the explanation, typed on camera.
 *
 * The demo pages carry data (probe rows, statuses) and nothing else; the
 * explanation lives here, not on the page.
 *
 * Log files: read from `autorecorder/videos/logs/{frontend,backend}.log` by
 * default. Running servers by hand, point `FRONTEND_LOG_FILE` /
 * `BACKEND_LOG_FILE` at wherever their output goes.
 */

// ── 1. the real Next.js dev overlay ────────────────────────────────────────

/**
 * Opens Next's issues overlay if Next has caught anything, reads it for the
 * viewer, and closes it. Returns the overlay's headline text, or null when
 * there was nothing to open.
 */
export async function showNextIssues(page: Page, dwellMs = 5500): Promise<string | null> {
  const badge = page.locator('nextjs-portal button[aria-label="Open issues overlay"]').first();
  const shown = await badge
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return null;

  const box = await badge.boundingBox();
  if (box) {
    await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
    await humanClick(page);
  } else {
    await badge.click().catch(() => {});
  }

  const dialog = page.locator('nextjs-portal [data-nextjs-dialog], nextjs-portal [role=dialog]').first();
  await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const text = ((await dialog.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

  const dbox = await dialog.boundingBox().catch(() => null);
  if (dbox) await humanGlide(page, dbox.x + Math.min(dbox.width / 2, 360), dbox.y + 90, 24);
  await sleep(dwellMs);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  return text ? text.slice(0, 240) : null;
}

// ── 2. the dev server's own log ────────────────────────────────────────────

export interface LogMark {
  files: { path: string; offset: number; label: string }[];
}

function logFiles(rootPath: string): { path: string; label: string }[] {
  const logs = join(rootPath, 'autorecorder', 'videos', 'logs');
  return [
    { path: process.env.FRONTEND_LOG_FILE || join(logs, 'frontend.log'), label: 'frontend' },
    { path: process.env.BACKEND_LOG_FILE || join(logs, 'backend.log'), label: 'backend' },
  ];
}

/** Records where each server log ends now, so the take reads only its own lines. */
export function markServerLogs(rootPath: string): LogMark {
  return {
    files: logFiles(rootPath)
      .filter((f) => existsSync(f.path))
      .map((f) => ({ ...f, offset: statSync(f.path).size })),
  };
}

function readFrom(path: string, offset: number): string {
  const size = statSync(path).size;
  if (size <= offset) return '';
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Request lines and log chatter that say nothing about a failure. */
const NOISE = [
  /inspector-metadata/,
  /\/threads(\?|\/subscribe| )/,
  /GET \/_next\//,
  /Compil(ing|ed)/,
  /✓/,
  /Lit is in dev mode/,
  /telemetry enabled/,
  /^\s*at /,
  /ignore-listed frames/,
  /^\s*[{}[\]],?\s*$/,
];

/** What a failure looks like in either server's output. */
const SIGNAL =
  /\b(4\d\d|5\d\d)\b|error|Error|failed|Failed|NOT_FOUND|NOT_ENTITLED|required|cannot|denied|refused|Unauthorized|Missing/;

/**
 * The lines the servers logged since `mark` that carry an error, cleaned for
 * reading: colour codes stripped, JSON bodies kept, long lines cut. Only the
 * last `max` are kept so the terminal ends on the most recent failure.
 *
 * `relevant` narrows it to the page under test. Without it, routine failures
 * from elsewhere in the app get filmed as if they were the finding — an
 * Intelligence runtime logs `THREAD_NOT_FOUND` on every new thread, before it
 * creates it.
 */
export function serverLogSince(
  mark: LogMark,
  opts: { max?: number; relevant?: RegExp } = {},
): string[] {
  const { max = 22, relevant } = opts;
  const out: string[] = [];
  for (const f of mark.files) {
    let text = '';
    try {
      text = readFrom(f.path, f.offset);
    } catch {
      continue;
    }
    for (const raw of text.split(/\r?\n/)) {
      // eslint-disable-next-line no-control-regex
      const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\s+$/, '');
      if (!line.trim() || NOISE.some((re) => re.test(line)) || !SIGNAL.test(line)) continue;
      if (relevant && !relevant.test(line)) continue;
      const clipped = line.length > 170 ? `${line.slice(0, 167)}...` : line;
      if (out[out.length - 1] !== clipped) out.push(clipped);
    }
  }
  // Too many: keep how it started and how it ended. A take that makes two
  // attempts (Memories: documented, then with the option) needs both on screen.
  if (out.length <= max) return out;
  const head = Math.floor((max - 1) / 2);
  return [...out.slice(0, head), '   ...', ...out.slice(-(max - 1 - head))];
}

/**
 * A terminal window over the page, showing the server lines one at a time — the
 * same Windows-terminal look as the rest of the recorder's desktop, opened from
 * the taskbar's terminal tile.
 */
export async function showServerTerminal(
  page: Page,
  lines: string[],
  opts: { title?: string; dwellMs?: number } = {},
): Promise<void> {
  if (lines.length === 0) return;
  const { title = 'npm run dev', dwellMs = 6500 } = opts;

  const tile = await page.evaluate(() => {
    const el = document.getElementById('win11-taskbar-terminal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (tile) {
    await humanGlide(page, tile.x, tile.y, 22);
    await humanClick(page);
    await sleep(350);
  }

  await page.evaluate(
    (a: { title: string }) => {
      document.getElementById('__ar_server_term')?.remove();
      const win = document.createElement('div');
      win.id = '__ar_server_term';
      win.style.cssText = [
        'position:fixed', 'left:50%', 'top:46%', 'transform:translate(-50%,-50%)',
        'width:min(1180px,82vw)', 'height:min(520px,58vh)', 'background:#0c0c0c',
        'border:1px solid #3a3a3a', 'border-radius:8px', 'box-shadow:0 18px 50px rgba(0,0,0,.55)',
        'z-index:2147483600', 'display:flex', 'flex-direction:column', 'overflow:hidden',
        'font-family:"Cascadia Mono",Consolas,"Courier New",monospace', 'font-size:13px',
      ].join(';');
      const bar = document.createElement('div');
      bar.style.cssText =
        'height:34px;background:#1f1f1f;color:#d4d4d4;display:flex;align-items:center;padding:0 12px;font-family:"Segoe UI",sans-serif;font-size:12px;gap:8px;flex-shrink:0';
      bar.textContent = '>_  ' + a.title;
      const body = document.createElement('div');
      body.id = '__ar_server_term_body';
      body.style.cssText = 'flex:1;padding:12px 14px;color:#cccccc;overflow:hidden;white-space:pre-wrap;word-break:break-all;line-height:1.55';
      win.append(bar, body);
      document.body.appendChild(win);
    },
    { title },
  );

  for (const line of lines) {
    await page.evaluate((l: string) => {
      const body = document.getElementById('__ar_server_term_body');
      if (!body) return;
      const row = document.createElement('div');
      const bad = /error|Error|failed|Failed|NOT_FOUND|NOT_ENTITLED|\b5\d\d\b/.test(l);
      const warn = /\b4\d\d\b/.test(l);
      row.style.color = bad ? '#f14c4c' : warn ? '#e5c07b' : '#cccccc';
      row.textContent = l;
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
    }, line);
    await sleep(140);
  }

  const bodyBox = await page.locator('#__ar_server_term_body').boundingBox().catch(() => null);
  if (bodyBox) await humanGlide(page, bodyBox.x + 300, bodyBox.y + bodyBox.height - 40, 26);
  await sleep(dwellMs);
  await page.evaluate(() => document.getElementById('__ar_server_term')?.remove());
  await sleep(400);
}

// ── 3. the explanation ─────────────────────────────────────────────────────

/** "copilotkit 1.71.0" — what this run installed, read from the frontend. */
export function copilotkitVersionLine(rootPath: string): string {
  try {
    const pkg = join(rootPath, 'frontend', 'node_modules', '@copilotkit', 'react-core', 'package.json');
    const { version } = JSON.parse(readFileSync(pkg, 'utf8')) as { version?: string };
    return version ? `copilotkit ${version}` : 'copilotkit (version unknown)';
  } catch {
    return 'copilotkit (version unknown)';
  }
}

/** Types the take's explanation into Notepad, the failure still behind it. */
export async function writeNote(page: Page, fileName: string, text: string): Promise<void> {
  await sleep(800);
  await openNotepad(page, fileName);
  await typeInNotepad(page, text, { charDelayMs: 26, thinkChance: 0.05 });
  await closeNotepad(page, 3500);
}

/** All three, in the order a developer would look. */
export async function showEvidence(
  page: Page,
  mark: LogMark,
  note: { fileName: string; text: string },
  opts: { relevant?: RegExp } = {},
): Promise<{ overlay: string | null; serverLines: string[] }> {
  const overlay = await showNextIssues(page);
  // Nothing relevant logged -> no terminal. A page that works has no server
  // story to tell, and an empty or off-topic terminal would suggest one.
  const serverLines = serverLogSince(mark, { relevant: opts.relevant });
  await showServerTerminal(page, serverLines);
  await writeNote(page, note.fileName, note.text);
  return { overlay, serverLines };
}
