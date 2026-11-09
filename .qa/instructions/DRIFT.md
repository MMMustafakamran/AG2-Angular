# Doc drift and versions

The docs and the packages move every day. CI tests what a new reader gets **today**, and never films a page whose doc changed until we have read the change and decided what it means (owner, 2026-11-08). Tools: `qa-kit/tools/drift.mjs`, `qa-kit/tools/versions.mjs`.

## 1. What CI does (plan job, before anything records)

1. **Versions:** `versions.mjs` re-resolves each project's lockfile within the ranges already in `package.json` / `pyproject.toml`, so `^1.84.1` installs the newest 1.x the night it ships. All shards install that one resolution. The recorder's own deps stay locked. Ranges are never rewritten in CI (`ncu -u` broke the old repos' CI). The run summary lists committed vs today vs npm latest.
2. **Drift:** `drift.mjs` compares the live docs with `doc-snapshot/`:
   - **pages:** `doc-snapshot/pages/*.md` vs `<docs>/<path>.md`, sorted by severity:
     - **HIGH:** a code block changed (an install command change is flagged as `install`);
     - **MEDIUM:** headings, callouts, tabs or a "not supported / coming soon" banner changed;
     - **LOW:** prose only.
   - **sidebar:** `doc-snapshot/sidebar.json` vs the live nav tree;
   - **links:** `doc-snapshot/links.json` vs the in-section links on every sidebar page;
   - **reachability:** `assignment.json` `reachable` vs what the live sidebar + links give today;
   - **gone / moved:** 404, or a redirect to another path; a gone page whose content shows up under a new URL is marked "probably renamed".
3. **Hold:** recorded pages with HIGH or MEDIUM drift, LOW drift on a ⚠️/❌ page (the highlighted evidence can be prose), gone, moved or reachability changes are **not recorded**. They are listed under "Held" in the run summary and `drift/held.md`; their old clip, status and Loom link stay until we decide.
4. **Recorded anyway:** LOW drift on a ✅ page, and pages the docs site failed to serve (drift unknown, not absent: said in the summary).

Manual dispatch inputs: `ignore_drift` (record held pages anyway: only to reproduce something), `use_lockfile` (install the committed lockfiles: to tell whether a break came from the doc or from a new package version).

## 2. Daily: read the drift before the clips

1. Open `drift/drift.md` and `versions.md` from the run artifact **first**. Diffs of each changed page: `drift/live/<file>.diff.txt`; the full live page next to it.
2. Sort each held page into a row of section 3. Look at the rendered page too, not only the `.md` export (they can differ).
3. Decide and act (no owner OK needed, [QA-RULES.md](QA-RULES.md) §6); list page · what changed · what was done in the summary.
4. Then: update the harness (verbatim), `probe` the page, then `node .qa/tools/drift.mjs --sync=<docPath>[,...]` (updates the snapshot, appends `doc-snapshot/CHANGELOG.md`), commit, and rerun just those pages (`gh workflow run daily.yml -f pages=<ids>`).
5. New baselines for sidebar and links: `drift.mjs --sync-nav` once the new/removed pages are decided.

## 3. What to do for each kind of change

| Change | Held? | What to do |
|---|---|---|
| Whitespace / formatting only | No (not reported) | Nothing. |
| Prose / typo, same steps (LOW, ✅ page) | No | `--sync` it. If the text adds or removes a step, treat it as a new step. |
| Prose on a ⚠️/❌ page (LOW) | Yes | Is the evidence text we drag-select still there? Changed → update `FINDING_EVIDENCE` and the narration lines probe, re-record. Gone because the doc now explains the step → is the finding fixed? |
| Code snippet changed (HIGH) | Yes | Copy the new code verbatim into the harness, probe, compare with the current status. Same result → re-record. Different → resolved / new finding (owner). |
| Install command or package list changed (`install`) | Yes | Install exactly what the doc says now (add/remove packages, version spec). A package that won't install is a level-1 finding. |
| Model or agent config changed (model id, `modelKwargs`, temperature) | Yes | Update the agent file verbatim. Temperature-only failures: QA-RULES §7. |
| New step or prerequisite (env var, file, command) | Yes | Add it to the harness as the doc says. If it needs guesswork → level-1 finding. |
| Step or snippet removed | Yes | Remove it from the harness. If the page now misses a piece the reader needs → finding. |
| The change fixes our finding | Yes | Probe. Works → ✅ "now working", the finding closes, plain clip, no narration. |
| The change adds a new problem | Yes | Probe, propose a finding (level per QA-RULES §8a). Nothing written before the OK. |
| "Not supported / coming soon" banner added or removed (MEDIUM `banner`) | Yes | Added → probe; if the feature really is gone, the row follows the banner. Removed → the page is testable now: record it. |
| Headings / tabs / callouts changed (MEDIUM `structure`) | Yes | Usually re-organised content: re-check the tour and evidence scroll targets, then re-record. A framework tab removed (our framework's code gone) → finding. |
| Page gone (404), not renamed | Yes | Remove the route, recorder entry and report row; close its findings. Keep the harness code in git history. |
| Page gone, "probably renamed to X" / redirects to X | Yes | Same content at a new URL: update `docPath` in `pages.config.ts` and `assignment.json`, the snapshot file name and the report link, then record. Content split or merged → treat as removed + new pages, move each finding to the page that now has that code. |
| Tracked page: sidebar → in-content | Yes | Set `reachable: in-content`, note which page links to it, keep testing it. |
| Tracked page: → none (no longer linked anywhere) | Yes | `reachable: none`: drop it from the report and recording; findings close. Keep the harness code. |
| Untracked page (`reachable: none` in assignment.json) is now linked or in the sidebar | Not recorded yet | It is in scope now (unless intelligence / backend / deploy): add route, recorder entry and `assignment.json` row; check the team doc for its status; probe; propose. |
| New page in the sidebar or newly linked ("New pages to decide") | Not recorded yet | Same as above. If the owner decides to skip it, `--sync-nav` so it stops showing. |
| Sidebar page renamed or moved to another group | No | Update the report's grouping rows / page label. |
| Dead link (in-section link → 404) | No | Minor note in FINDINGS.md (level 3/4); not a blocker unless the reader needs that page to finish the steps. |
| Docs site unreachable / page fetch error | No | Recorded on the old snapshot; summary says "drift unknown". Check it by hand next day if it repeats. |
| Sidebar baseline missing | No | Run `drift.mjs --sync-nav` locally and commit. |

## 4. Versions

| Versions report says | What to do |
|---|---|
| A package changed since the committed lockfile (e.g. `@copilotkit/runtime` 1.84.1 → 1.85.0) | All pages were recorded on it. Review as usual; a status change is a finding or a "now working". After review, commit `resolved/` lockfiles from the run artifact and update the `Stack:` line in FINDINGS.md and `assignment.json` `versions` / `testedContext`. |
| **Behind npm latest** (range blocks it: new major, `^0.0.x`, an exact pin from a scaffold like `next 16.4.5`) | A reader starting today gets the newer one. If the doc's install command has no version → owner decides on bumping the range (reviewed edit to package.json, never CI). If the doc pins the version → keep it. |
| A dir failed to re-resolve | That dir used the committed lockfile: say so in the review; often a peer-dependency clash in the new release (could itself be a finding if the doc's install fails the same way). |
| Something breaks only on the new versions | Rerun with `use_lockfile` to confirm the doc code is unchanged and the package caused it. That is a finding (the doc's own install gives the reader the breaking version). |
