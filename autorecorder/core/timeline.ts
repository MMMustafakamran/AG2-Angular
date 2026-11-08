/**
 * Per-take evidence: when each step of the clip starts, what the recorder did, what the page said,
 * and what was on screen — all in seconds from the start of the video. See ../SCHEMA.md.
 *
 * Written next to the .webm:
 *   <clip>.timeline.json   schema 2: marks (segments), checkpoints (expectations), keyframes
 *   <clip>.events.jsonl    one event per line: actions, console, page errors, failed requests, navigations
 *   <clip>.frames/         NNN-<label>.jpg, a viewport screenshot per mark and per checkpoint
 *
 * LOGGING ONLY. Nothing here may change what the doc code does, retry anything, hide an error, or
 * put anything on screen: listeners are passive, probes only read, screenshots are taken by the
 * browser (they never appear in the video), and every function here swallows its own failures.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type BrowserContext, type Locator, type Page } from 'playwright';

export const TIMELINE_SCHEMA = 2;

interface Mark { t: number; label: string; detail?: string }
interface Checkpoint { t: number; label: string; expect: string; observed: string | null; ok: boolean }
interface Keyframe { t: number; label: string; file: string }
type Event = { t: number; kind: string; [k: string]: unknown };

/** What a checkpoint probe may return: text seen (null = missing), or a plain yes/no. */
export type ProbeResult = string | null | boolean | undefined;

let t0 = 0;
let recordedAt = '';
let pageInfo: { slug: string; docUrl?: string } | undefined;
let marks: Mark[] = [];
let checkpoints: Checkpoint[] = [];
let events: Event[] = [];
let frames: { t: number; label: string; data: Buffer }[] = [];
let pending: Promise<unknown>[] = [];
let page: Page | undefined;
let detach: (() => void)[] = [];
let ended = 0;
/** Call order, so entries sharing a tenth of a second keep the order they were made in. */
let seq = 0;

const MAX_TEXT = 2000;
const FRAME_QUALITY = 55;
/**
 * Segment marks fire just before the segment's first navigation or window switch, when the screen
 * is still the previous step or a blank frame. Their screenshot waits this long so it shows the
 * segment itself; the keyframe's own `t` is when it was actually taken.
 */
const FRAME_DELAY_MS: Record<string, number> = { doc: 1500, ide: 1800, demo: 2500, terminal: 1500, notepad: 1500 };
/**
 * A shot can fail while the page is mid-navigation or a dev server is still compiling it (the
 * screenshot waits for fonts and a stable frame). Try again a little later rather than leave the
 * segment without a frame. Background only; the take never waits.
 */
const FRAME_ATTEMPTS = 4;
const FRAME_RETRY_MS = 2000;
const PROBE_TIMEOUT_MS = 3000;

const now = (): number => Math.round((Date.now() - t0) / 100) / 10;
const clip = (s: unknown): string => {
  const text = String(s ?? '');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
};

const order = new WeakMap<object, number>();
function push(kind: string, fields: Record<string, unknown>, t = now(), n = ++seq): void {
  if (!t0) return;
  const e: Event = { t, kind, ...fields };
  order.set(e, n);
  events.push(e);
}
const byTime = (a: { t: number }, b: { t: number }) => a.t - b.t || (order.get(a) ?? 0) - (order.get(b) ?? 0);

/**
 * Call when the recorded page is created (Playwright starts the video then). With a page, the
 * browser's console, page errors, failed requests and navigations are logged to events.jsonl.
 * Listeners go on the *context* where Playwright has one, so a handler that clears the page's own
 * listeners (showDocEvidence does, for the doc site's hydration noise) does not silence the log.
 */
export function startTimeline(recordedPage?: Page): void {
  stopListening();
  t0 = Date.now();
  recordedAt = new Date(t0).toISOString();
  pageInfo = undefined;
  marks = [];
  checkpoints = [];
  events = [];
  frames = [];
  pending = [];
  ended = 0;
  seq = 0;
  page = recordedPage;
  if (recordedPage) listen(recordedPage);
}

/** Which doc page this take is for. Goes in timeline.json `page`. */
export function setTimelinePage(slug: string, docUrl?: string): void {
  pageInfo = { slug, ...(docUrl ? { docUrl } : {}) };
}

function listen(p: Page): void {
  const ctx: BrowserContext = p.context();
  const onConsole = (msg: any) => {
    try {
      const loc = msg.location?.();
      push('console', {
        level: msg.type(),
        text: clip(msg.text()),
        ...(loc?.url ? { source: `${loc.url}:${loc.lineNumber ?? 0}` } : {}),
      });
    } catch {}
  };
  const onWebError = (err: any) => {
    try {
      const e = err.error?.() ?? err;
      push('pageerror', { message: clip(e?.message ?? e), ...(e?.stack ? { stack: clip(e.stack) } : {}) });
    } catch {}
  };
  const onFailed = (req: any) => {
    try {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      push('network', { method: req.method(), url: clip(url), status: null, error: req.failure()?.errorText ?? 'failed' });
    } catch {}
  };
  const onResponse = (res: any) => {
    try {
      const status = res.status();
      if (status < 400) return;
      push('network', { method: res.request().method(), url: clip(res.url()), status });
    } catch {}
  };
  const onNav = (frame: any) => {
    try {
      if (frame === p.mainFrame()) push('navigation', { url: clip(frame.url()) });
    } catch {}
  };
  // Every real mouse press and key press the recorder sends, in any frame, for the click/typing
  // sounds. A capture-phase listener sees the event before the page can stop it.
  const onInput = (kind: string) => {
    if (kind === 'click' || kind === 'key' || kind === 'backspace' || kind === 'enter') logInput(kind);
  };
  const installInputHook = () => {
    const w = window as any;
    if (w.__qaInputHooked) return;
    w.__qaInputHooked = true;
    window.addEventListener('mousedown', () => w.__qaInput?.('click'), true);
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      w.__qaInput?.(e.key === 'Backspace' ? 'backspace' : e.key === 'Enter' ? 'enter' : 'key');
    }, true);
  };
  p.exposeFunction('__qaInput', onInput).catch(() => {}); // throws if already exposed on this page
  p.addInitScript(installInputHook).catch(() => {});
  for (const f of p.frames()) f.evaluate(installInputHook).catch(() => {});
  ctx.on('console', onConsole);
  ctx.on('weberror', onWebError);
  ctx.on('requestfailed', onFailed);
  ctx.on('response', onResponse);
  p.on('framenavigated', onNav);
  detach = [
    () => ctx.off('console', onConsole),
    () => ctx.off('weberror', onWebError),
    () => ctx.off('requestfailed', onFailed),
    () => ctx.off('response', onResponse),
    () => p.off('framenavigated', onNav),
  ];
}

function stopListening(): void {
  for (const off of detach) {
    try {
      off();
    } catch {}
  }
  detach = [];
}

/**
 * A viewport screenshot for the frames folder. Fire-and-forget: the take never waits on it.
 * `caret: 'initial'` because Playwright's default hides the text caret with an injected style for
 * the duration of the shot, which would flicker in the video.
 */
function frame(label: string, delayMs = 0): void {
  const p = page;
  if (!t0 || !p) return;
  const take = t0;
  const job = (async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    for (let attempt = 1; attempt <= FRAME_ATTEMPTS; attempt++) {
      if (t0 !== take || ended || p.isClosed()) return;
      const t = now();
      try {
        const data = await p.screenshot({ type: 'jpeg', quality: FRAME_QUALITY, caret: 'initial', scale: 'css', timeout: 4000 });
        if (t0 === take) frames.push({ t, label, data });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, FRAME_RETRY_MS));
      }
    }
  })().catch(() => {});
  pending.push(job);
}

/** An extra screenshot for the frames folder at a moment worth seeing (e.g. a finished note). */
export function keyframe(label: string): void {
  frame(label);
}

/** Record that a step starts now. Safe to call when no timeline is running. */
export function mark(label: string, detail?: string): void {
  if (!t0) return;
  const m: Mark = { t: now(), label, ...(detail ? { detail } : {}) };
  marks.push(m);
  push('mark', { label, ...(detail ? { detail } : {}) });
  if (label !== 'end') frame(label, FRAME_DELAY_MS[label] ?? 0);
}

/**
 * A mouse press or key press the viewer would hear, for events.jsonl (`kind: "input"`), with
 * millisecond time. The narration mix lays a click / key sound at each one. Logged by the
 * browser listener in listen() for real input, and by overlays that write text without real key
 * events (Notepad). Safe to call when no timeline is running.
 */
export function logInput(input: 'click' | 'key' | 'backspace' | 'enter' | 'paste'): void {
  if (!t0) return;
  push('input', { input }, Math.round(Date.now() - t0) / 1000);
}

/**
 * Something the recorder did, for events.jsonl. `action` is click / scroll / type / select / key /
 * select-text; `target` is a selector, locator description or short text.
 */
export function logAction(action: string, target: string, result: 'ok' | string = 'ok', extra: Record<string, unknown> = {}): void {
  push('action', {
    action,
    target: clip(target),
    result: result === 'ok' ? 'ok' : 'error',
    ...(result === 'ok' ? {} : { error: clip(result) }),
    ...extra,
  });
}

/** Run `fn`, log it as an action (ok or the error message), and return or rethrow exactly as `fn` did. */
export async function tracked<T>(action: string, target: string, fn: () => Promise<T>, extra?: Record<string, unknown>): Promise<T> {
  try {
    const out = await fn();
    logAction(action, target, 'ok', extra);
    return out;
  } catch (e) {
    logAction(action, target, e instanceof Error ? e.message.split('\n')[0] : String(e), extra);
    throw e;
  }
}

/** A short printable description of a locator for the log. */
export function describe(target: Locator | string): string {
  try {
    return typeof target === 'string' ? target : String(target);
  } catch {
    return '(locator)';
  }
}

/**
 * Record what the page shows against what the doc promises. `probe` only reads the page: return
 * the text seen (null when it is missing) or a boolean. `ok` is true for non-empty text or `true`,
 * unless `opts.ok` decides. Never throws, never retries, and is bounded, so it cannot change the
 * take. Logging only: the page's verdict is still whatever the handler reports through ctx.
 * Returns the promise so a caller *may* await it; handlers call it with `void` to keep their timing.
 */
export function checkpoint(
  label: string,
  expect: string,
  probe: () => Promise<ProbeResult> | ProbeResult,
  opts: { ok?: (observed: string | null) => boolean } = {},
): Promise<void> {
  if (!t0) return Promise.resolve();
  const t = now();
  const n = ++seq;
  const job = (async () => {
    let raw: ProbeResult = null;
    try {
      raw = await Promise.race([
        Promise.resolve().then(probe),
        new Promise<ProbeResult>((r) => setTimeout(() => r(null), PROBE_TIMEOUT_MS)),
      ]);
    } catch {
      raw = null;
    }
    const observed = typeof raw === 'boolean' ? String(raw) : raw == null || raw === '' ? null : clip(String(raw).trim()).slice(0, 500);
    let ok: boolean;
    try {
      ok = opts.ok ? opts.ok(observed) : typeof raw === 'boolean' ? raw : observed !== null;
    } catch {
      ok = false;
    }
    const cp: Checkpoint = { t, label, expect, observed, ok };
    order.set(cp, n);
    checkpoints.push(cp);
    push('checkpoint', { label, expect, observed, ok }, t, n);
  })().catch(() => {});
  pending.push(job);
  frame(label);
  return job;
}

/** Probe helper: the visible text of the first match, or null when nothing visible matches. */
export async function probeText(target: Locator): Promise<string | null> {
  const el = target.first();
  if (!(await el.isVisible().catch(() => false))) return null;
  const text = await el.innerText({ timeout: 1500 }).catch(() => null);
  return text?.trim() ? text.trim() : null;
}

/**
 * Call while the page is still open, just before it closes: marks `end`, takes the last frame,
 * waits for outstanding screenshots and probes, and stops listening. saveTimeline calls it too
 * (without a frame) if the engine did not.
 */
export async function endTimeline(): Promise<void> {
  if (!t0 || ended) return;
  const p = page;
  if (p && !p.isClosed()) {
    frame('end');
  }
  await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, 8000))]);
  mark('end');
  ended = now();
  stopListening();
}

/**
 * Write the timeline, events and frames for a saved clip, and reset. `path` is the .timeline.json
 * path; the other two outputs go beside it with the same stem.
 */
export function saveTimeline(path: string, clipId: string): void {
  if (!t0) return;
  if (!ended) {
    mark('end');
    ended = now();
    stopListening();
  }
  const stem = path.replace(/[.]timeline[.]json$/, '');
  const dir = join(stem, '..');
  const framesDirName = `${basename(stem)}.frames`;
  const framesDir = join(dir, framesDirName);
  const keyframes: Keyframe[] = [];
  try {
    rmSync(framesDir, { recursive: true, force: true });
    if (frames.length) mkdirSync(framesDir, { recursive: true });
    frames.sort((a, b) => a.t - b.t);
    frames.forEach((f, i) => {
      const name = `${String(i + 1).padStart(3, '0')}-${f.label.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)}.jpg`;
      try {
        writeFileSync(join(framesDir, name), f.data);
        keyframes.push({ t: f.t, label: f.label, file: `${framesDirName}/${name}` });
      } catch {}
    });
  } catch {}
  try {
    const doc = {
      schema: TIMELINE_SCHEMA,
      clip: clipId,
      video: `${basename(stem)}.webm`,
      durationS: ended,
      recordedAt,
      page: pageInfo ?? { slug: clipId },
      marks,
      checkpoints: [...checkpoints].sort(byTime),
      keyframes,
    };
    writeFileSync(path, JSON.stringify(doc, null, 2));
  } catch {
    // A missing timeline only means the clip can't be narrated automatically.
  }
  try {
    events.sort(byTime);
    writeFileSync(`${stem}.events.jsonl`, events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
  } catch {}
  t0 = 0;
  page = undefined;
  marks = [];
  checkpoints = [];
  events = [];
  frames = [];
  pending = [];
}
