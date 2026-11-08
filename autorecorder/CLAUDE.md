# Working in `autorecorder/`

**Before editing anything here, read [ADAPT.md](../.qa/recorder/ADAPT.md).**

Bringing an older copy of this folder up to the CLI pipeline (recording
`copilotkit create`, the installs and the scaffolded app)? Read
[PORT-CLI.md](../.qa/recorder/PORT-CLI.md) as well.

This folder is a portable screen-recording suite shared across every CopilotKit
framework repo adapted per framework.

Two rules override any instinct to tidy:

1. **`core/` is generated — don't edit it here.** It is a copy of
   `qa-kit/recorder/core/` (workspace root), the one place core code is edited,
   written by `bash 2-shared/qa-kit/sync.sh` (workspace root) (which also refreshes `.qa/`). A
   hand edit here is refused by the next sync and reported. It holds no
   framework-specific values — they come from `config/`; per-repo behaviour
   goes in `config/` or `actions/`. A real core change: edit
   `qa-kit/recorder/core/`, run `node qa-kit/recorder/scripts/core-manifest.mjs --write`,
   append the old hashes to `qa-kit/recorder/core-history.txt`, then sync every
   repo. `npm run core:check` verifies this copy against `core/CORE_MANIFEST.json`.

2. **`npm run doctor` is the definition of done.** Not "the config looks right".
   The command exits 0, or the adaptation is not finished. Say which check fails
   rather than describing the work as complete.

The adaptation surface is exactly: `config/project.config.ts`,
`config/pages.config.ts`, `config/selectors.config.ts`, `config/cli.config.ts`,
and `actions/`.

A page handler in `actions/` reports through its fourth argument, `ctx`:
`ctx.warn(...)` for something the doc promises that was not observed (the run
shows `PASS*` with the note), `ctx.fail(...)` when the feature did not work
(the clip is still saved, the page reports `FAIL`). A `console.log` reaches
nobody — the summary and `videos/RECORD_RESULTS.json` only see what goes
through `ctx`.

When a change here is worth keeping across repos, it belongs in `core/` and
should be ported to the other copies — say so explicitly so it can be.

## `core/` change ported from DeepAgentspy-angular (2026-09-25)

- `console-capture.ts` / `engine.ts`: `breakingErrors`. An uncaught exception,
  Angular's `ERROR`/`NG0xxx`, or a failed request to a localhost harness server
  now FAILs the take instead of adding one warning line.
- `console-capture.ts`: hydration mismatches are no longer in `IGNORED`. They
  show as console errors (warnings on the take), not silence.
- This recorder has no `[ISSUE]` outcome. DeepAgentspy-angular's
  `ctx.reproduced` / `[ISSUE]`-only-when-observed is there if you need it.
