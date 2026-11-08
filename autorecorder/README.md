# Autorecorder

Automated screen-recording suite for CopilotKit framework integrations. It
produces one demo video per documentation page: read the doc, switch to VS Code
and show the code that implements it, switch to the browser and drive the live
feature. The clips are silent — the pacing carries them, and there is no audio
stage in the pipeline.

Currently configured for **Agno (Python) + React** — the 16 routes of this repo
that have a chrome-free `demo-chat` page. The other 5 doc routes are reference
pages with nothing to drive; see *Scope* below.

> **Porting this to another framework?** Read **[ADAPT.md](../.qa/recorder/ADAPT.md)** first. It
> is written for the person or agent doing the port, and it is the contract the
> `doctor` command enforces.

---

## Run it

Both services must be up first — the recorder refuses to start otherwise, because
a video of a dead page is worse than no video.

```bash
cd backend  && uv run main.py                        # :8010
cd frontend && npm run dev                           # :3010
```

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
| `--<page-id>` | Record one page — `--quickstart`, `--slots` |
| `--page=<id>` | Same thing, explicit form |
| `--filter=<query>` | Record every page whose id or name contains the query |
| `--force` | Record even if the pre-flight health check fails |

Videos land in `videos/` as `AGNO-react-<NN>-<name>.webm`, 1920×1080, ~25fps
(Playwright's capture rate; it is not configurable).

**`videos/` is gitignored on purpose.** Recordings are build output — reproducible
from this folder plus `npm run record` — and committing them is expensive: 17 clips
at ~5MB, rewritten on every re-record, took one repo's `.git` to 348MB before its
history had to be rewritten. Publish them as release assets or to a bucket. Keep
this policy when you copy the folder into another repo.

---

## Scope in this repo

A page is recordable only if it has something to drive, and the recorder reaches
every demo at `<route>/demo-chat`. Five of this app's doc routes are reference
material with no such page and are deliberately **not** registered:

| Route | Why it has no video |
|---|---|
| `/` | Orientation and a server-side connection check. |
| `/threads` | Reference: what threads persist and why. |
| `/threads/import` | Reference; Agno is not a documented import source. |
| `/threads/architecture` | Reference: replay, reconnection, locks. |
| `/generative-ui/your-components/interactive` | The upstream doc page is an empty stub. |

Registering them anyway would fail `doctor --online`, because `demoUrl` is always
`route + demoSuffix` and there is no per-page way to say "this one has no demo".
That is a gap in `core/`, not something to work around here — see ADAPT.md.

The three Rich Threads demos record **unlicensed**: the drawer shows its locked
view and `useThreads` returns an empty list. That is the correct result, not a
failure, and the chat beside each of them still drives a real agent turn.

---

## Tracking recordings

Clips are **not** in git, and every run overwrites the same 16 filenames in place
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
or missing, which is the form to use from a script.

**What it does not tell you: whether the run passed.** Playwright saves the video
even when a page fails, so a clip from a failed run still looks current. Freshness
and correctness are different questions — the run summary answers the second one.

---

## Pages that are supposed to fail

Not every demo works, and some do not work for reasons outside this repo. When a
page's failure *is* the story, the handler captures what the browser reported
during the run and surfaces it on screen — `actions/error-console.ts`. The video
shows the feature working, and then the error that ended it. Recording such a
page as a success would imply a working feature; failing it outright would
produce nothing to look at.

**Currently: none.** `display-only` and `frontend-tools` were the two. Both ran
their tool, streamed an answer, and then stopped, because Agno needs a
configured database to resume after an externally-executed tool and the agent
had none. `backend/agent.py` now configures one (repo README, known issue #12)
and both re-record clean as of 2026-08-31.

Both handlers keep the overlay wired up, because the failure returns the moment
the `db` goes away — but it is no longer scripted. The overlay renders only when
the browser actually reports something, and renders what it reported. The old
behaviour passed a hardcoded `message:`, which meant the two pages kept showing
a database error for a bug they no longer had. **If you script an error message,
you are asserting a defect the run did not have to produce — don't.**

### Next.js Dev Error Overlay (`openNextJsErrorOverlay`)

Autorecorder includes built-in support for rendering the official Next.js 16 Dev
Error Overlay:
1. Displays the bottom-left red **"N 1 Issue ✕"** toast badge (docked above the taskbar).
2. Smoothly glides the virtual cursor to the toast badge and clicks it.
3. Opens the sleek dark Next.js Dev Error window showing the `< 1/1 >` header,
   `Next.js Turbopack` status badge, `Console Error` pill, the exact red error
   message, and `Call Stack` frame count.
4. Glides the virtual cursor up to the error message for comfortable reading.

Alternatively, `openDevToolsConsole` remains available to dock a simulated Chrome
DevTools console along the bottom.

Two rules keep that from becoming a way to hide real breakage:

- The error overlay only appears when an error is captured or specified — with
  nothing to show it now skips rather than falling back to a canned message. A
  silent page still fails the run.
- The reply is still awaited normally. A page that neither answers nor errors is
  an unexplained failure and is treated as one.

## Reading the summary

```
   ✅ [PASS]  (24.1s) Quickstart -> MSPY-react-01-Quickstart.webm
   ⚠️  [PASS*] (31.7s) Inspector -> MSPY-react-06-Inspector.webm
        · Doc page (…/inspector): Timeout 25000ms exceeded
   ❌ [FAIL]  (19.4s) AG-UI -> MSPY-react-17-AgUi.webm
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
  evidence. The process exits 1, so a script can act on it.

Every run also writes `videos/RECORD_RESULTS.json` — one entry per page with
the verdict, duration, warnings and distinct console errors — so what *this
run* recorded can be read back, rather than guessed from every `.webm` that
happens to be in the folder.

---

## When a take fails

A failed take no longer ends on the broken page. Before the browser closes,
the recorder opens the simulated terminal and prints what it saw: the
diagnosed verdict, the browser console errors, and this page's slice of
`videos/logs/backend.log` and `frontend.log` (from where they stood when the
take began). Each section is windowed around the line most worth reading --
a traceback, an `Error`, a 4xx/5xx -- and that line is painted red, so the
clip itself shows the cause. The same text is written to
`videos/logs/<page-id>.error.log`, so an agent can diagnose from the log
without re-running anything.

Passing takes are untouched: the terminal appears only on failure, which is
what a person who hit an error would do. `core/failure-evidence.ts` holds
the logic; the engine calls it from the `finally` of `recordPage`.

## Layout

The split between what you edit and what you don't is the point of this folder.

```
autorecorder/
├── (ADAPT.md, PORT-CLI.md live in ../.qa/recorder/, synced from qa-kit)
├── cli.ts                      ← entrypoint, arg parsing, summary
│
├── config/                     ← ★ THE ADAPTATION SURFACE
│   ├── project.config.ts         framework slug, doc root, URLs, start commands
│   ├── pages.config.ts           one entry per doc page
│   └── selectors.config.ts       how to find the chat surface
│
├── actions/                    ← ★ what to DO on each page
│   ├── index.ts                  page id → handler registry
│   ├── page-ready.ts             wait until the app can actually be driven
│   ├── error-console.ts          put browser errors on screen when that is the story
│   └── *.action.ts               per-page interaction scripts
│
├── core/                       ← ✖ DO NOT EDIT — generated from the workspace 2-shared/qa-kit/recorder/core by sync.sh
│   ├── CORE_MANIFEST.json        hash per core file; `npm run core:check` enforces it
│   ├── engine.ts                 browser lifecycle, the 3-step sequence, pass/fail
│   ├── actions.ts                sendPrompt, response detection, standard action
│   ├── doctor.ts                 the adaptation contract, as a command
│   ├── diagnostics.ts            pre-flight health check
│   ├── console-capture.ts        browser console/page/network errors, per take
│   ├── select.ts                 which pages a `record` invocation means
│   ├── timeouts.ts               every fixed wait, with project/page overrides
│   ├── types.ts                  PageDefinition → PageRecordConfig, ActionContext
│   ├── cli/                      PTY driver, casts, terminal replay, finding notes
│   ├── ide/generator.ts          VS Code simulator, Shiki-highlighted from disk
│   └── overlays/                 Windows 11 taskbar, virtual cursor, Notepad, human pacing
│
├── cli-capture.ts              ← run the real CLI and the installs, write casts
├── cli-render.ts               ← film the casts; `npm run cli:videos` for the set
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
page id. So two clips do not type, pause and scroll in the same rhythm — but
today's Quickstart clip is identical to yesterday's, which keeps two
recordings of the same page comparable.

- **Typing** has a person's rhythm everywhere it happens: the chat prompt, the
  Notepad note, and the command typed at the terminal prompt before its output
  starts. Jittered keystrokes, a beat after punctuation, the odd pause.
- **Scrolling** is in bursts: a few wheel notches, a reading pause, a few more,
  sometimes a nudge back up.
- **Pauses** vary by about a quarter around their nominal length. They are
  the only thing `AUTORECORD_PACE` scales (`0.85` for a brisker take): a reading or
  thinking pause gets shorter, the typing, the mouse and the scrolling do not.
- **The cursor** overshoots slightly on long travel and settles, hovers a
  variable moment before a click, drifts while a reply streams instead of
  freezing, and starts each take somewhere plausible rather than dead centre.
- **Windows** fade in over 180ms (IDE, terminal, Notepad) instead of cutting.

Two details worth knowing, because both were bugs once:

- Overlays are injected as children of `<html>`, which React owns on any App
  Router page. `ensureOverlays` installs a MutationObserver that re-attaches them
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

## Recording the CLI

The quickstart's own first step is `npx copilotkit@latest create`, and this
folder records it for real: the CLI driven through a PTY, then the scaffold
installed with each of npm, pnpm, yarn and bun, then each copy's dev server
booted and its app driven. It is local-only: sign-in needs a browser.

```bash
npm run capture -- --login        # once; opens a browser
npm run capture -- --scaffold     # drives `copilotkit create`, writes casts/
npm run capture -- --distribute   # copies the scaffold into the four folders
npm run capture -- --install-npm  # and pnpm, yarn, bun
npm run cli:videos                # films everything the reports say to film
```

### The videos

| Clip | What it shows | When |
|---|---|---|
| `CLI-Create` | the CLI scaffolding the app | always, once |
| `<pm>-2-Install` | that manager installing the copy | always, per manager |
| `<pm>-3-Demo` | the app running and answering a prompt | when the install passed |
| `<pm>-3-Finding` | the failure explained: versions, manifest, the error, a note | when it failed |

Which third clip a manager gets is read from its install report in
`casts/*.report.json`, not decided by hand. A failure nobody has analysed yet
still gets a clip: the note is generated from the report, and the hand-written
`INSTALL_ANALYSIS` entry in `config/cli.config.ts` is appended once there is one.

The prompts the CLI is answered with are in `config/cli.config.ts` and were
carried over from the reference run, not observed here yet — see
`1-cli-testing/CLI-FLOW.md` for what is predicted versus verified, and
[PORT-CLI.md](../.qa/recorder/PORT-CLI.md) for how the pipeline fits together.

---

## Troubleshooting

**`Aborting before launching a browser`** — a service is down. The message names
which one and the command to start it. `--force` overrides.

**A page fails with "Agent never produced a response within 30s"** — either the
demo is genuinely broken, or `selectors.config.ts → assistantMessage` does not
match this app's messages. Run `npm run doctor --online` to tell the two apart.

**The IDE highlights the wrong lines** — the line range drifted. `npm run doctor`
names the file and where its markers actually are now.

**A page fails only on the first run after starting the dev server** — it was
still compiling. The readiness gate absorbs this (it will log
`agent endpoint compiled in Ns` when it did real work), but the *agent's* own
cold start is separate: the first model call after starting the backend can take
~60s, which is longer than the 30s response window. Send one message by hand, or
record a single page, before running the full suite.

**A recording passes but the video is wrong** — the doctor cannot see cursor
placement or highlight correctness. Watch it.
