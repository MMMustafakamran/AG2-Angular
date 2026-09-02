# Version Watch — scenario and rationale

Implemented by `ci/check-versions.mjs` and the **2. Versions & setup** stage in
`.github/workflows/daily-recorder.yml`.

## The scenario

This repo is a QA harness for **CopilotKit's Angular client** against **AG2**,
verifying that documented code snippets actually run. That makes dependency
versions part of the subject under test, not background maintenance.

Four independently-released trains meet here:

| Layer | Package | Train |
|---|---|---|
| Angular client | `@copilotkit/angular` | `0.x` |
| JS core / runtime | `@copilotkit/core`, `@copilotkit/runtime` | `1.x` |
| Wire protocol | `@ag-ui/*` | `0.0.x` |
| Python agent | `ag2[ag-ui,openai]` | `1.x` |

They do not move together. What `frontend/package.json` declares today —
`@copilotkit/angular` `^0.4.0`, `@copilotkit/runtime` `^1.69.0`,
`@ag-ui/client` `^0.0.58` — is three different release cadences held in one
tree, and `@copilotkit/angular` exact-pins several `@copilotkit/*` packages that
the runtime declares as ranges. That is the shape this job exists to keep
visible; the numbers themselves come from the report, not from this file, which
would otherwise go stale the first time anything moved.

The first scheduled run establishes the baseline in `ci/resolved-versions.json`.
From then on `git log -p ci/resolved-versions.json` is the timeline.

## What the nightly already did, and what was missing

`ci/automate.mjs` **drops the lockfiles and re-resolves** on every run
(`--use-lockfile` opts back out, off by default). So the recorders already test
the newest versions the declared ranges allow — but silently. The resolution was
discarded, so:

- a broken recording could be our code or a dependency bump, with no way to tell;
- a clean run never revealed what had moved;
- nothing could see **past** the range boundary, which is where every real
  question in this repo lives.

The watch adds the record and the out-of-reach view. It changes nothing about
what gets installed or recorded.

## Why versions can be behind — three causes

Only one is ours to act on, so the report **classifies** rather than lists.

| # | Cause | Actionable? | Detected by |
|---|---|---|---|
| 1 | Upstream **exact pin** (`"@copilotkit/core": "1.69.3"`) | No — report upstream | `npm view <pkg> dependencies` |
| 2 | **peerDependency** range (Angular 22 constrains TypeScript) | No — correct as-is | dry-run `ERESOLVE`, peer branch |
| 3 | Our own range is behind | **Yes — bump by hand** | `npm outdated`, dry-run succeeds |

Treating `npm outdated`'s `Latest` column as a to-do list is the failure mode:
TypeScript can read as a full major behind while bumping it breaks the Angular
build outright.

**npm decides the bucket, not a hardcoded list.** For anything past the range
boundary the script runs `npm install <pkg>@latest --dry-run
--package-lock-only`, which writes nothing. `ERESOLVE` means a peer range or an
exact pin forbids the upgrade — and the message names the blocker. Success means
it is simply a range we have not bumped.

## What the stage does

1. **Snapshot + diff** — writes `ci/resolved-versions.json` (frontend,
   autorecorder and backend, the last read from `uv.lock`) and reports what
   moved since the previous run.
2. **Classified `npm outdated`** — packages where `wanted === latest` are folded
   away, since the next re-resolve picks those up unprompted; only what sits past
   the boundary gets a dry-run and a bucket.
3. **Upstream pin probe** — what the newest `@copilotkit/angular`,
   `@copilotkit/runtime` and `@ag-ui/client` force on consumers. `npm outdated`
   cannot see these: they are transitive, so they never appear as something we
   asked for.
4. **Fragmentation** — multiple copies of `@ag-ui/client`, `@ag-ui/core`,
   `@copilotkit/core` in one tree, and who pulled each.

### Design decisions

- **Snapshot committed, not stored as an artifact.** Artifacts expire and are
  not diffable across runs. Committed, `git log -p ci/resolved-versions.json`
  *is* the timeline, and each recording is tied to the versions that produced it.
- **A separate job, not folded into the recorders.** They are sharded 3x, so an
  inline check would run three times — and three independent re-resolves can
  disagree about what "today's versions" are. One job, one resolve, one answer.
- **Not a gate on the recorders.** A moved pin is news, not a build failure;
  demos must still record. Stage 3 depends on it with `always()` for exactly
  that reason.
- **`contents: write`, scoped by the commit step** to `ci/resolved-versions.json`
  alone. `package.json` and the lockfiles are never touched. This is a real
  concession — a pure read-only job would be safer — accepted because git history
  is what makes the timeline worth having. Note the job holds **no model API
  key**: write access and the secrets are deliberately never in the same job.
- **Commits only on `schedule`.** Manual runs report without writing history.
- **A rejected push warns, it does not fail.** If the default branch is
  protected the push is refused; that is a repo-settings answer, not a broken
  run, and the report is already published by then. The summary says so and the
  job stays green. Switch the step to open a PR if protection is here to stay.
- **A failed probe reports loudly.** If `npm outdated` returns nothing
  parseable, the report says *unknown*, never *clean*. Silence that reads as an
  all-clear is the one lie this job cannot tell.
- **No `ncu -u` on a schedule.** It rewrites `package.json` to `Latest`
  wholesale, ignoring declared ranges — exactly the cause-2 breakage above.
  Dependabot is the safe alternative if PR-based automation is wanted later.

### Two implementation notes worth keeping

- **npm runs through a shell.** On Windows `npm` is a `.cmd` shim and, since the
  CVE-2024-27980 mitigation, Node refuses to `execFile` one (`EINVAL`) — which
  fails quietly enough to look like an all-clear.
- **`^` narrows as the major approaches zero:**

  | Range | Allows |
  |---|---|
  | `^1.69.0` | `>=1.69.0 <2.0.0` |
  | `^0.4.0` | `>=0.4.0 <0.5.0` |
  | `^0.0.58` | **only `0.0.58`** |

  Every `@ag-ui/*` range is `0.0.x`, so they are effectively pinned. `npm update`
  will never move them; they need a manual edit. `npm outdated` still flags them
  — which is exactly why checking and upgrading stay separate steps.

## The limit that cannot be engineered away

Re-resolving only ever reaches the range boundary. It will never produce the
`@copilotkit/core` that a newer `@copilotkit/angular` pins, because the client
that pins it is itself out of range — `^0.4.0` stops at `<0.5.0`. Nor should it
ever produce a TypeScript the Angular build forbids. Crossing the boundary is a
human edit:

```bash
git checkout -b chore/bump-<pkg>
npm --prefix frontend install <pkg>@<version>
git diff frontend/package-lock.json   # one bump can drag in dozens of transitives
npm --prefix frontend run build
# then run the harness — that is what this repo is for
```

Revert is always `git checkout frontend/package-lock.json && npm ci`.

## Running it locally

```bash
node ci/check-versions.mjs             # report only, writes nothing
node ci/check-versions.mjs --snapshot  # also rewrite ci/resolved-versions.json
```

The dry-run classification makes one network round trip per out-of-range
package, so a cold local run takes a few minutes.
