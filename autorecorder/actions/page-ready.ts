/**
 * "Is this page actually ready to be driven?"
 *
 * The engine waits for the demo route to return HTML and for `chatReady` to be
 * visible, and then hands over. On a warm route that is enough. On a cold one it
 * is not: a dev server compiles client chunks lazily, so the markup can be on
 * screen while the framework has not yet attached a single event listener. The
 * recorder then types into an input that is not wired to anything — the
 * characters land in the DOM, the submit does nothing, and the run either fails
 * with "agent never responded" or records a video of a chat that never sent.
 *
 * That is what happened to the slots page: three tabs, each remounting a chat,
 * with a prompt fired at a route the dev server was still compiling.
 *
 * ── Why not the existing waitForHydration() ────────────────────────────────
 * `core/overlays/taskbar.ts` has one, and it is neat: it appends a probe to
 * <html> and watches for the framework to delete it while reconciling. But it
 * cannot distinguish "not hydrated yet" from "hydrated before we asked" — both
 * look like a probe that never disconnects, so on an already-settled page it
 * burns its full timeout and returns false. The engine says as much in its own
 * comment, which is why step 3 skips it. These checks return the moment the page
 * is settled instead, so they cost nothing when there was nothing to wait for.
 *
 * ── Portability ────────────────────────────────────────────────────────────
 * Nothing here knows about Agno, CopilotKit, React or Next. It reads
 * `SELECTORS.chatInput` from the adaptation config and otherwise relies on
 * `document.readyState` and a DOM-stability window, which mean the same thing in
 * an Angular or Vue app as they do here. It lives in `actions/` only because
 * `core/` is frozen: it belongs in `core/` and should be promoted and ported to
 * the other framework repos, which all have this same gap.
 */

import { type Page } from 'playwright';
import { PROJECT } from '../config/project.config';
import { SELECTORS } from '../config/selectors.config';
import { sleep } from '../core/overlays/cursor';

export interface ReadyOptions {
  /** Give up after this long and continue anyway. */
  timeoutMs?: number;
  /** How long the DOM must stop changing before it counts as settled. */
  settleMs?: number;
  /** Element that must be present, visible and enabled. Defaults to the chat input. */
  inputSelector?: string;
  /** Label for the log line, so multi-step pages say which step is waiting. */
  label?: string;
}

/**
 * Resolves once the DOM has stopped changing for `settleMs`.
 *
 * Cheap proxy for "the framework finished rendering": a page still hydrating,
 * still streaming, or still swapping in a lazily compiled chunk is mutating.
 * Element count *and* markup length are both sampled, because a re-render that
 * swaps content without changing the node count still moves the second number.
 *
 * @returns Whether it settled before the timeout.
 */
export async function waitForDomSettled(
  page: Page,
  opts: ReadyOptions = {},
): Promise<boolean> {
  const { timeoutMs = 20000, settleMs = 1000 } = opts;
  const sampleMs = 250;
  const needed = Math.max(2, Math.ceil(settleMs / sampleMs));

  let previous = '';
  let stable = 0;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const sample = await page
      .evaluate(() => {
        const body = document.body;
        if (!body) return 'no-body';
        return `${document.getElementsByTagName('*').length}:${body.innerHTML.length}`;
      })
      .catch(() => '');

    if (sample && sample !== 'no-body' && sample === previous) {
      if (++stable >= needed) return true;
    } else {
      stable = 0;
      previous = sample;
    }
    await sleep(sampleMs);
  }

  return false;
}

/**
 * Compiles the agent endpoint by asking for it once.
 *
 * A page can be fully hydrated and still be backed by an API route the dev
 * server has never built, because it builds those on first request — which is
 * the prompt itself. The first POST then spends its budget compiling rather than
 * answering, and the run reports that the agent never replied.
 *
 * Fired from the browser so it shares the page's origin and cookies. The
 * response is irrelevant and expected to be an error; triggering the build is
 * the point.
 */
async function warmRuntimeEndpoint(page: Page): Promise<void> {
  const path = PROJECT.runtimeWarmPath;
  if (!path) return;

  const url = new URL(path, PROJECT.frontendUrl).toString();
  const took = await page
    .evaluate(async (target) => {
      const started = Date.now();
      try {
        await fetch(target, { method: 'GET', cache: 'no-store' });
      } catch {
        // A refused or errored request still compiled the route.
      }
      return Date.now() - started;
    }, url)
    .catch(() => -1);

  if (took > 3000) {
    console.log(`   ✓ agent endpoint compiled in ${(took / 1000).toFixed(1)}s (${path})`);
  }
}

/**
 * Full pre-flight before driving a demo page: the document has finished loading,
 * the DOM has stopped changing, the agent endpoint behind it is built, and the
 * control we are about to type into exists and accepts input.
 *
 * Deliberately never throws. A page that refuses to settle is not necessarily
 * broken — and if it really is, the action that follows fails with a message
 * about the actual feature, which is far more useful than one about a timer.
 */
export async function waitForPageReady(
  page: Page,
  opts: ReadyOptions = {},
): Promise<void> {
  const {
    timeoutMs = 30000,
    settleMs = 1000,
    inputSelector = SELECTORS.chatInput,
    label = 'page',
  } = opts;

  const started = Date.now();
  const left = (): number => Math.max(1000, timeoutMs - (Date.now() - started));

  // Kick the endpoint build off immediately so it compiles while the page
  // settles, rather than adding its cost on top.
  const warming = warmRuntimeEndpoint(page);

  // 1. The document itself is done -- on a dev server this is the part that
  //    covers "still compiling", because lazily built chunks are still requests.
  await page
    .waitForFunction(() => document.readyState === 'complete', { timeout: left() })
    .catch(() => {
      console.warn(`   ⚠️ ${label}: document never reached readyState "complete".`);
    });

  // 2. Rendering has stopped moving.
  const settled = await waitForDomSettled(page, { timeoutMs: left(), settleMs });

  // 3. The thing we are about to interact with is really interactive. An input
  //    that is present but disabled is the signature of a half-mounted chat.
  const usable = await page
    .waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (!el) return false;
        if (el.disabled || el.readOnly) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      },
      inputSelector,
      { timeout: left() },
    )
    .then(() => true)
    .catch(() => false);

  // Do not start typing until the endpoint that answers is actually built.
  await warming;

  const waited = ((Date.now() - started) / 1000).toFixed(1);
  if (settled && usable) {
    console.log(`   ✓ ${label} ready after ${waited}s`);
  } else {
    console.warn(
      `   ⚠️ ${label} not fully settled after ${waited}s ` +
        `(dom-settled=${settled}, input-usable=${usable}); continuing anyway.`,
    );
  }
}
