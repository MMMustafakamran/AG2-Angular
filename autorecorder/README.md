# Autorecorder

Automated screen-recording suite for CopilotKit framework integrations. It
produces one narrated-looking demo video per documentation page: read the doc,
switch to VS Code and show the code that implements it, switch to the browser and
drive the live feature.

Currently configured for **AG2 (Python) + Angular** — the
11 routes of this repo that have a chrome-free `/demo` page. The one remaining
doc route, the Introduction landing page, has nothing to drive; see *Scope*
below.

> **Porting this to another framework?** Read **[ADAPT.md](ADAPT.md)** first. It
> is written for the person or agent doing the port, and it is the contract the
> `doctor` command enforces.

---

## Run it

Both services must be up first — the recorder refuses to start otherwise, because
a video of a dead page is worse than no video.

```bash
cd backend  && uv run main.py    # AG2 / FastAPI :8400
cd frontend && npm run dev       # Copilot Runtime :8401 + ng serve :4204
```

`npm run dev` starts **two** processes. Angular has no server route to host the
Copilot Runtime, so it runs as its own Node process (`frontend/server.ts`). The
AG2 backend already owns 8400, so the runtime binds **8401** and the
browser posts across origins to it — which is why `runtimeWarmPath` in
`project.config.ts` is an absolute URL rather than a path.

The AG-UI stream is POST-only (`AGUIStream(agent).build_asgi()` mounted at
`/agent`, and the mount needs its trailing slash — a slashless POST answers 307).
The pre-flight check probes `/openapi.json` instead — the same endpoint
`frontend/src/app/components/backend-health.ts` uses, so both halves of the repo
agree on what "up" means.

Then:

```bash
cd autorecorder
npm install
npx playwright install chromium

npm run doctor            # is the configuration sane?
npm run record -- --list  # what will be recorded
npm run record -- --quickstart
npm run record            # all pages, in order
```

| Flag | Effect |
|---|---|
| `--list`, `--help` | Print every registered route and exit |
| `--doctor` | Validate the configuration; exits 1 on error |
| `--doctor --online` | Also probe every doc/demo URL and the selectors |
| `--<page-id>` | Record one page — `--quickstart`, `--threads` |
| `--page=<id>` | Same thing, explicit form |
| `--filter=<query>` | Record every page whose id or name contains the query |
| `--force` | Record even if the pre-flight health check fails |

Videos land in `videos/` as `AG2-angular-<NN>-<name>.webm`, 1920×1080, ~25fps
(Playwright's capture rate; it is not configurable).

**The clips are gitignored on purpose.** Recordings are build output — reproducible
from this folder plus `npm run record` — and committing them is expensive: the clips
at ~5MB each, rewritten on every re-record, took one repo's `.git` to 348MB before its
history had to be rewritten. Publish them as release assets or to a bucket. Keep
this policy when you copy the folder into another repo.

The ignore rule is `*.webm`, not the directory: `videos/manifest.json` and
`videos/MANIFEST.md` live there too and are *meant* to be committed (see
*Tracking recordings*). The repo root's `.gitignore` ignored the whole directory
and hid them; it now ignores `autorecorder/videos/*.webm`.

---

## Scope in this repo

A page is recordable only if it has something to drive, and the recorder reaches
every demo at `<route>/demo`. One of this app's 12 doc routes is reference
material with no such page and is deliberately **not** registered:

| Route | Why it has no video |
|---|---|
| `/` | Orientation and a live connection check; `demoPath()` returns undefined for it. |

`/status` is also absent — it is app furniture (the implementation-status table),
not a doc page, and the nav does not list it.

Registering it anyway would fail `doctor --online`, because `demoUrl` is always
`route + demoSuffix` and there is no per-page way to say "this one has no demo".
That is a gap in `core/`, not something to work around here — see ADAPT.md.

Four routes (`/threads`, `/memory`, `/attachments`, `/headless`) share one
`docPath`, because the Angular docs cover all four topics on one page.

Three pages record a **documented limitation** rather than a working feature, and
say so on screen in a Notepad window rather than leaving the viewer to guess:

| Page | What the video shows |
|---|---|
| `a2ui` | Middleware enabled, renderer inert — the guide's catalog snippets are not self-contained, so no `a2ui.catalog` can be supplied. |
| `voice-multimodal` | The microphone records; this runtime configures no transcription service, so transcription fails by design. The turn is then completed by keyboard. |
| `threads` | Thread endpoints are licensed; unlicensed the list stays empty and the drawer renders locked. The chat beside it answers normally. |

That Notepad overlay lives in `actions/notepad.ts`. Like `actions/page-ready.ts`
it is framework-agnostic and belongs in `core/`; it sits in `actions/` only
because `core/` is frozen.

---

## Tracking recordings

Clips are **not** in git, and every run overwrites the same 11 filenames in place
— so nothing about the files themselves says which are fresh. `npm run manifest`
is what closes that gap:

```bash
npm run record            # produces the clips
npm run manifest          # records their state — run this straight after
```

It writes two committed files next to the (uncommitted) videos:

| File | For |
|---|---|
| `videos/manifest.json` | source of truth — per clip: mtime, size, sha256, the source files it shows, and a hash of those files plus the page definition |
| `videos/MANIFEST.md` | the same thing as a table, readable on GitHub |

Commit both. **The diff on those files is the record of what a run changed** —
that is the whole mechanism. Together they are ~12KB, against ~84MB of video.

| Status | Means |
|---|---|
| ✅ current | clip matches the code it shows |
| 🆕 new | the clip changed since the last manifest — this run re-recorded it |
| ⚠️ stale | a source file was modified *after* the clip was recorded |
| ⚠️ drifted | mtimes look fine but the source content hash moved (mtimes all reset on a fresh clone, which hides staleness — this catches it) |
| ❌ missing | a registered page with no clip on disk |

A clip is judged against the files it actually puts on screen — its `ideFile` and
any `extraTabs` — plus its own page definition, so changing a prompt or a
highlighted line range marks it stale exactly as an edit to the code does.

`npm run manifest:check` prints without writing and exits 1 if anything is stale
or missing, which is the form to put in CI.

**What it does not tell you: whether the run passed.** Playwright saves the video
even when a page fails, so a clip from a failed run still looks current. Freshness
and correctness are different questions — the run summary answers the second one.

---

## Reading the summary

```
   ✅ [PASS]  (24.1s) Quickstart -> AG2-angular-01-Quickstart.webm
   ⚠️  [PASS*] (31.7s) Memory -> AG2-angular-09-Memory.webm
        · Doc page (…/threads-memory-attachments-headless): Timeout 25000ms exceeded
   ❌ [FAIL]  (19.4s) Headless UI -> AG2-angular-11-HeadlessUi.webm
        · Demo step failed: Agent never produced a response within 30s
```

- **PASS** — every step completed.
- **PASS\*** — recorded, with a note. Either the external doc page misbehaved
  (intro footage degraded, feature not implicated), or the page's handler
  reported something the doc promises that it did not see (`ctx.warn`), or the
  browser console logged errors during the demo step.
- **FAIL** — the demo route 404'd, never rendered a chat surface, the agent never
  answered, the IDE view could not be built, or the handler reported that the
  feature under test did not work (`ctx.fail`). The clip is still saved as
  evidence. The process exits 1, so this is safe to gate CI on.

Every run also writes `videos/RECORD_RESULTS.json` — one entry per page with
the verdict, duration, warnings and distinct console errors. `ci/lib/report.mjs`
reads it, so the CI report lists what *this run* recorded rather than every
`.webm` that happens to be in the folder.

---

## When a take fails

A failed take leaves evidence behind. Before the browser closes, the
recorder gathers what it saw -- the diagnosed verdict, the browser console
errors, and this page's slice of `videos/logs/backend.log` and
`frontend.log` (from where they stood when the take began) -- and writes it
to `videos/logs/<page-id>.error.log`. Each section is windowed around the
line most worth reading (a traceback, an `Error`, a 4xx/5xx) and that line
is marked `>>`, so an agent can diagnose from the log without re-running
anything locally. CI uploads the file with the run (the shard upload glob
covers `videos/logs/*.log`).

The React recorders also replay the same text in their simulated terminal
window at the end of the clip. This recorder has no terminal window
(`core/cli/` is not part of the Angular port), so the evidence is log-only
and the console says so. Passing takes are untouched.
`core/failure-evidence.ts` holds the logic; the engine calls it from the
`finally` of `recordPage`.


## Layout

The split between what you edit and what you don't is the point of this folder.

```
autorecorder/
├── ADAPT.md                    ← how to port this; read before editing
├── cli.ts                      ← entrypoint, arg parsing, summary
│
├── config/                     ← ★ THE ADAPTATION SURFACE
│   ├── project.config.ts         framework slug, doc root, URLs, start commands
│   ├── pages.config.ts           one entry per doc page
│   └── selectors.config.ts       how to find the chat surface
│
├── actions/                    ← ★ what to DO on each page
│   ├── index.ts                  page id → handler registry
│   ├── page-ready.ts             pre-flight gate (belongs in core/)
│   ├── notepad.ts                on-screen findings window (belongs in core/)
│   └── *.action.ts               per-page interaction scripts
│
├── core/                       ← ✖ DO NOT EDIT — no framework knowledge here
│   ├── CORE_MANIFEST.json        hash per core file; `npm run core:check` enforces it
│   ├── engine.ts                 browser lifecycle, the 3-step sequence, pass/fail
│   ├── actions.ts                sendPrompt, response detection, standard action
│   ├── doctor.ts                 the adaptation contract, as a command
│   ├── diagnostics.ts            pre-flight health check
│   ├── console-capture.ts        browser console/page/network errors, per take
│   ├── select.ts                 which pages a `record` invocation means
│   ├── timeouts.ts               every fixed wait, with project/page overrides
│   ├── types.ts                  PageDefinition → PageRecordConfig, ActionContext
│   ├── ide/generator.ts          VS Code simulator, Shiki-highlighted from disk
│   └── overlays/                 Windows 11 taskbar, virtual cursor, human pacing
│
├── scripts/core-manifest.mjs   ← core/ drift check (--check / --write / --diff)
├── test/                       ← unit tests for the pure modules (`npm test`)
│
└── videos/                     ← output, plus RECORD_RESULTS.json per run
```

Every framework-specific value lives in `config/`. If something in `core/` needs
to change for a port, that is a bug in this folder — see ADAPT.md.

---

## What a recording actually does

1. **Doc page** — opens the real documentation URL, waits for hydration, then
   scrolls at reading pace and rests the cursor on a code block. Clicks VS Code
   on the simulated taskbar.
2. **IDE** — renders the project's own source, read from disk and highlighted
   with Shiki, with the page's line range selected. Multi-tab pages switch tabs.
   Served from the frontend's origin via an intercepted route, so the doc page is
   fully unloaded rather than painted over. Clicks Chrome on the taskbar.
3. **Demo** — opens the chrome-free demo route, waits for it to be genuinely
   ready, types the prompt, waits for the reply to finish streaming, and pauses
   for reading.

### What makes it read as a person

Every pace in a take comes from `core/overlays/human.ts`, seeded from the
page id. So the Quickstart clip and the Chat UI clip do not type, pause and
scroll in the same rhythm — but tonight's Quickstart clip is identical to
last night's, which keeps two recordings of the same page comparable.

- **Typing** has a person's rhythm: jittered keystrokes, a beat after
  punctuation, the odd mid-sentence pause. A retry after a swallowed submit is
  typed quickly instead — that is the recorder recovering, not a performance.
- **Scrolling** is in bursts: a few wheel notches, a reading pause, a few more,
  sometimes a nudge back up.
- **Pauses** vary by about a quarter around their nominal length. They are
  the only thing `AUTORECORD_PACE` scales (CI sets `0.85`): a reading or
  thinking pause gets shorter, the typing, the mouse and the scrolling do not.
- **The cursor** overshoots slightly on long travel and settles, hovers a
  variable moment before a click, drifts while a reply streams instead of
  freezing, and starts each take somewhere plausible rather than dead centre.
- **The IDE window** fades in over 180ms instead of cutting.

Two details worth knowing, because both were bugs once:

- Overlays are injected as children of `<html>`. The doc site is itself a React
  app and reclaims that element on hydration. `ensureOverlays` installs a MutationObserver that re-attaches them
  if a render pass deletes them, and step 1 waits for hydration before scrolling
  so a remount cannot snap the page back to the top.
- Playwright starts recording when the page is created, so the first navigation
  is dead footage. The doc URL is warmed in a throwaway page first, which cuts
  it roughly in half; removing the rest would need an ffmpeg trim in post.
- A dev server serves markup before it serves behaviour. "The route responded"
  and "the chat works" are different claims: client chunks compile lazily, and
  API routes compile on their *first request* — which would otherwise be the
  prompt. `actions/page-ready.ts` waits for the document to finish, the DOM to
  stop changing, the input to be genuinely enabled, and `runtimeWarmPath` to be
  built, before any handler types anything. Without it a cold route produces a
  video of a prompt that was never really sent.

---

## Troubleshooting

**`Aborting before launching a browser`** — a service is down. The message names
which one and the command to start it. `--force` overrides.

**A page fails with "Agent never produced a response within 30s"** — either the
demo is genuinely broken, or `selectors.config.ts → assistantMessage` does not
match this app's messages. Run `npm run doctor --online` to tell the two apart.

**The IDE highlights the wrong lines** — the line range drifted. `npm run doctor`
names the file and where its markers actually are now.

**A page fails once, then passes unchanged** — the agent's first model call after
an idle period can exceed the 30s response window. This is the most common false
failure here; re-run the page before investigating anything else.

**A page fails only on the first run after starting the dev server** — it was
still compiling. The readiness gate absorbs this (it will log
`agent endpoint compiled in Ns` when it did real work), but the *agent's* own
cold start is separate: the first model call after starting the backend can take
~60s, which is longer than the 30s response window. Send one message by hand, or
record a single page, before running the full suite.

**A recording passes but the video is wrong** — the doctor cannot see cursor
placement or highlight correctness. Watch it.
