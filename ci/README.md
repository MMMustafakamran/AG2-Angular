# `ci/` — the recording pipeline

One entry point, used identically by a developer and by GitHub Actions:

```bash
node ci/automate.mjs            # check docs, install, start three servers, record all pages
```

`.github/workflows/daily-recorder.yml` is the same thing in four stages, with
the drift check hoisted out in front of three sharded workers.

## Layout

```
ci/
  automate.mjs           the pipeline: drift -> preflight -> install -> servers -> record
  check-doc-drift.mjs    read-only drift gate; exit 0 clean, 2 drifted
  check-versions.mjs     read-only version watch (see VERSION-WATCH.md)
  run-name.mjs           the artifact name for a run: AG2-angular-02Sep2026-0531UTC
  resolve-selection.mjs  dispatch checkboxes + page ids -> a page list
  list-pages.mjs         print the recorder's page ids
  validate-pages.mjs     fail a bad --pages= selection early
  resolved-versions.json committed snapshot; written by check-versions --snapshot
  compare-results.mjs    diffs a run against autorecorder/expected-results.json
  lib/
    config.mjs           paths, ports, URLs — the only place they are written down
    pages.mjs            PAGE_GROUPS + page ids, read from the recorder's config
    env.mjs              .env loading and credential trimming
    preflight.mjs        ports free, model key usable, routes warmed
    report.mjs           RUN_REPORT.md / RUN_REPORT.json
    signature.mjs        reduces a page result to a comparable signature
```

## What is NOT here, on purpose

This repo already owned four of the pieces a pipeline needs before `ci/`
existed. They were left where they were rather than reimplemented, so each has
exactly one implementation:

| Job | Lives in | Why not under `ci/` |
|---|---|---|
| Rewriting `doc-snapshot/` | `frontend/scripts/sync-docs.ts` (`npm run doc:sync`) | It computes a real LCS diff, classifies hunks as code or prose, writes `CHANGELOG.md` and rotates `doc-snapshot/reports/`. A second, poorer writer would be a second way to move the baseline — one of them skipping the changelog. `check-doc-drift.mjs --update` shells out to it. |
| Muxing narration | `autorecorder/mux.mjs` | The track table is repo-specific: this repo's Shared State narration is its own, longer clip rather than the one the sibling Angular repos share. Two tables can disagree; one cannot. |
| `frontend/VERSIONS.md` | `frontend/scripts/write-versions.ts` (`npm run gen:versions`) | The recorder's doctor already calls it, and the Quickstart clip puts the file on screen. `automate.mjs` invokes it after install. |
| Recording manifest | `autorecorder/manifest.ts` (`npm run manifest`) | Provenance for the clips on disk. Run by the **consolidate** job, never by a shard — see below. |

## Result baseline

`autorecorder/expected-results.json` holds the verdict a person signed off on
for every page: `pass`, or `fail` with an `errorClass` and a normalised
`message`, plus a `reason`. After every CI run the consolidate job runs
`compare-results.mjs` over all shards and classifies each page as
`unchanged`, `new-error`, `resolved`, `error-changed`, `notes-changed`,
`untracked` or `not-run`. All unchanged → the package is safe to publish
unseen. Anything else → a `results-changed` issue names the pages.

| Command | What it does |
|---|---|
| `npm run results:compare` | Compare `autorecorder/videos/` against the baseline (exit 3 on change) |
| `npm run results:compare -- --dir <folder>` | Same, over a downloaded package |
| `npm run results:accept -- --dir <folder>` | Fold the run's changes into the baseline; then edit the `reason` fields |
| `npm run results:seed` | Write a baseline from scratch (first run only) |

`ignoreNotes` in the baseline is a list of regexes for warnings that carry no
information (a console line every page logs). The signature drops ports,
URLs, timings and hex ids before comparing, so only the kind of failure counts.

## Commands

```bash
node ci/automate.mjs                       everything, all pages
node ci/automate.mjs --pages=quickstart     one page
node ci/automate.mjs --shard=1/3            the CI matrix slice
node ci/automate.mjs --skip-install         reuse what is installed
node ci/automate.mjs --allow-port-reuse     record against servers already up
node ci/check-doc-drift.mjs                 drift only; exit 2 if the docs moved
node ci/check-versions.mjs                  version report; writes nothing
node ci/list-pages.mjs                      valid page ids
```

From the repo root, `npm run automate`, `npm run drift`, `npm run ci:pages` and
`npm run ci:versions` are the same commands.

## Flags

| Flag | Effect |
|---|---|
| `--pull` | `git pull` first |
| `--use-lockfile` | install the committed lockfiles instead of re-resolving |
| `--skip-install` | no installs at all |
| `--ignore-doc-drift` (`--force`) | record even though the docs moved |
| `--allow-port-reuse` | do not start servers on ports already served |
| `--skip-credential-check` | bypass the model-credential preflight |

Anything else is forwarded to the recorder — `--pages=`, `--shard=K/N`,
`--limit=N`, and the single-page forms in `autorecorder/cli.ts`.

## The three services

| Service | Port | Started by | Health |
|---|---|---|---|
| AG2 backend | 8400 | `uv run main.py` in `backend/` | `GET /health` |
| Copilot Runtime | 8401 | `npm run dev` in `frontend/` | `GET /api/copilotkit/info` |
| Angular dev server | 4204 | the same `npm run dev` | `GET /` |

Two spawns, three services: Angular has no server route to host the Copilot
Runtime the way a Next app does, so `frontend/server.ts` is its own Node process
and `concurrently` starts it alongside `ng serve`. The AG2 backend already owns
8400, which is why the runtime sits on 8401 and `ng serve` on 4204 — that is
what lets this stack run beside the Agno, Mastra and MsPy harnesses.

All three port numbers live in `ci/lib/config.mjs` and nowhere else under `ci/`.

## Why one process

Each `run:` step in a GitHub Actions job is its own subshell, so a server
started with `&` in one step is reaped before the next step begins. The previous
`record.yml` worked around that with six steps — start, start, poll, doctor,
record, mux — every one of them restating a port. Spawning the servers inside
`automate.mjs` keeps them alive for as long as the recorder needs them, and
collapses the whole thing into one step.

## What runs, in order

1. **Doc drift** against `doc-snapshot/`. Drifted and not forced: report and
   exit 2, before anything is installed.
2. **Preflight** — `.env` loaded, credentials trimmed, ports checked, model key
   verified. All of it cheap, all of it before the expensive parts.
3. **Install** — `uv sync --upgrade`, then `npm install` in `frontend/` and
   `autorecorder/` with the lockfiles dropped (`--use-lockfile` opts out), then
   `npm run gen:versions`.
4. **Servers**, backend first: the runtime's `/info` is only meaningful once
   there is an agent behind it.
5. **Warmup** — the demo routes and the runtime endpoint, so the recorder's own
   preflight is not racing a first load.
6. **Record**, then mux, then `RUN_REPORT.md` — the last two in a `finally`, so
   a failed run still leaves its evidence.

## Page selection

`autorecorder/config/pages.config.ts` is the single source of truth for which
demos exist. `ci/lib/pages.mjs` reads the ids straight out of it — textually, so
the gate needs no TypeScript toolchain — and maps them onto the dispatch form's
five checkboxes:

| Checkbox | Pages |
|---|---|
| Getting Started | `quickstart`, `inspector`, `chat-ui` |
| Generative UI | `frontend-tools-generative-ui`, `a2ui` |
| Interaction | `voice-multimodal`, `human-in-the-loop` |
| Shared State | `shared-state` |
| Threads | `threads`, `memory`, `attachments`, `headless` |

`assertGroupsCoverAllPages()` fails the run if a page belongs to no group or to
two, so a page added to the recorder cannot silently become unreachable from the
dispatch form. `workflow_dispatch` allows at most ten inputs and this form uses
nine — which is why these are sections rather than one checkbox per page.

## CI shape

| Stage | Job | Gates the next? |
|---|---|---|
| 1 | `prepare` — drift gate, run name, page selection | **yes** |
| 2 | `versions` — what resolved, what is out of reach | no, reports only |
| 3 | `record-workers` — 3 shards, each a full stack | — |
| 4 | `consolidate-recordings` — merge, then write the manifest | — |

Stage 1 runs on a bare checkout with no install, which is the whole reason
everything it calls is dependency-free `.mjs`. Stage 3 depends on stage 2 with
`always()`: a red version report is news, not a reason to skip recording.

The **manifest is written in stage 4, never in a shard.** `npm run manifest`
rewrites `manifest.json` against whatever clips are on disk, so a shard holding
four of twelve pages would mark the other eight missing, and three shards would
publish three different wrong manifests.

`verify.yml` stays separate. It is the per-push gate — no secrets, no browser,
no model calls — and its red light means someone broke the code in this repo.
This pipeline's red light means the docs moved or a recording failed.

`versions` resolves the dependency trees once (lockfile-free npm installs and
`uv lock --upgrade`) and shares them through a run-scoped cache. Each worker
restores that cache and runs `automate.mjs --use-lockfile` against the fresh
lockfiles, so all three shards record against one resolution and skip the
minutes of re-resolving. A cache miss (`versions` red or skipped) falls back to
resolving in the worker.

## Artifact names

`ci/run-name.mjs` stamps every artifact from one run with the same name:

```
AG2-angular-02Sep2026-0531UTC
AG2-angular-02Sep2026-0531UTC-drift
AG2-angular-02Sep2026-0531UTC-shard-1
```

A downloaded folder should say what it is and when it ran without the Actions
run page next to it. The prefix matches `videoPrefix` in
`autorecorder/config/project.config.ts`, so the folder and the clips inside it
read as the same thing — and an Angular clip stays distinguishable from its
React twin when they land in one folder.

## Secrets and variables

| Name | Kind | Used by |
|---|---|---|
| `OPENAI_API_KEY` | secret | `record-workers` only |
| `OPENAI_CHAT_MODEL_ID` | variable, defaults to `gpt-4o-mini` | `record-workers` |

`backend/main.py` builds an `OpenAIConfig` unconditionally and reads exactly
these two — there is no Azure branch on this backend.

The key is validated for shape, never printed, at the top of the recording job.
A secret stored with a stray newline defeats GitHub's log masking: the mask
matches the stored value, so a trimmed form of it — which is what an error
message prints — sails straight through into a public log. That happened once
and cost a rotation.

Note which job holds what: `versions` has `contents: write` and no model key;
`record-workers` has the model key and no write access.

## Troubleshooting

**"Port(s) in use"** — a previous run left servers behind. Stop them, or pass
`--allow-port-reuse` to record against them. It refuses by default because a
stale server carrying an old API key is indistinguishable from a fresh one, and
whichever accepts first wins.

**Drift reported on every page** — the hash in `check-doc-drift.mjs` must be
computed exactly the way `frontend/scripts/sync-docs.ts` computes it (raw bytes,
no line-ending normalisation). A checker that hashes differently from the writer
reports drift on everything, every night, forever.

**`Unable to resolve reference $rxjs`** — npm 10. The frontend pins npm 12 in
`packageManager` and the `overrides` block needs it. CI reads that pin rather
than restating it.

**A clip has no narration** — `ffmpeg` is missing. `autorecorder/mux.mjs` skips
rather than failing; a silent demo still beats no demo.
