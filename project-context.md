# Project Goal

QA on the CopilotKit Angular AG2 docs
(<https://docs.copilotkit.ai/angular/ag2>). The job is **finding bugs and
ambiguity in those doc pages**. The deliverable is a written QA report of the findings plus one
recording per page. Everything here is tooling for that; a clean run that finds
nothing when the docs are broken is a failed run, not a passing one.

## Layout

| Path | What it is |
|---|---|
| `doc-snapshot/` | Version-controlled copy of the upstream doc pages, plus `CHANGELOG.md` of drift |
| `frontend/`, `backend/` | The harness — each doc page is a live route running what that page teaches |
| `autorecorder/` | Per-page demo capture (doc → code → live feature), paced to look human |
| `prior-testing/` | The earlier manual pass's page-level verdicts, carried in for comparison |

There is no `ci/` here yet. The steps it automated elsewhere are individually
runnable: `npm run drift`, `npm run versions`, `npm run record`.

## Cycle

```
drift check → implement changed pages into the harness → record → report
```

## Rules

1. Snippets go in **verbatim**, highlighted ones especially. A snippet that fails
   as published is the finding — do not fix it.
2. Broken pages keep their broken implementation; the clip exists to show the
   defect.
3. Ambiguity is a defect: missing steps, undefined identifiers, unstated
   prerequisites. Report it even if inference makes the page work.
4. Every finding pins installed vs declared versions.

## What is specific to AG2

The nine Angular guide pages under `/angular/ag2` are **byte-identical** to the
ones under `/angular/ms-agent-python` once the integration slug is normalised —
verified at sync time. That is itself the largest finding available here: the
Angular half of every page is shared boilerplate, and the only page that is
supposed to differ per integration, the quickstart's backend step, ships the
literal comment `<!-- setup skipped: agent-setup is not bundled for ag2 -->`
where the AG2 server should be. So the doc set never once shows AG2 code.

The consequences are in `readme.md` under Known issues. In short: three of the
capabilities the Angular pages teach (interrupts, `agent.setState`, A2UI) cannot
work against an AG2 backend, and no page says so.

## Gaps the pipeline misses — check by hand

- **New pages** — no route, no recorder entry, no diff; snapshotted but untested.
- **Removed/renamed pages** — leave a live route and a passing recording behind.
- **Legacy code** — the old implementation surviving beside the new one and
  keeping a page falsely green.
- **Pages with no `/demo` route** — unregistered in the recorder, never recorded.
- **Silent failures** — clean console, no error; drift and recording both pass.
- **Divergence from the React build** of the same guide; nothing compares them.

## Done

Drift implemented · §gaps reconciled · superseded code deleted · all routes
recorded · report rebuilt · **clips actually watched**.
