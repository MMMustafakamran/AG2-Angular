# QA rules

The harness exists to show doc defects. Any fix that hides one defeats the purpose of QA.

## 1. Verbatim code

- Put doc snippets in exactly as published. If a snippet fails as published, that failure is the finding. Never fix it.
- Broken pages stay broken, and their clips show the defect.
- **Never fix or hide a doc-caused error, even a cosmetic one.** No Suspense wrappers, no suppressed overlays, no silenced console errors.
- One exception (owner, 2026-11-08): the Next.js dev "N Issues" badge is turned off (`devIndicators: false` in `next.config.ts`, marked `HARNESS`), and the recorder closes the remaining issues pill with its own close button when the demo loads (`dismissNextIssues` in `core/engine.ts`). `CopilotKitProvider`'s `Date.now()` put it on every clip, working ones too; it stays a minor note in `FINDINGS.md`.
- If a request sounds like "remove / fix this error" in a harness, ask what is meant first, or explain that the error stays visible and is logged in `FINDINGS.md`.

## 2. HARNESS changes (the only allowed edits)

- Allowed only when needed to reach a page at all: ports, agent registration, missing helper files the doc never shows.
- Mark every such line or file with a `HARNESS` comment saying what was changed and why.
- A harness workaround that makes a broken page work is evidence, not a fix: keep the verbatim version too, and the finding still stands.

## 3. Ambiguity is a defect

Missing steps, undefined identifiers, unstated prerequisites, wrong-framework code, empty tabs: all findings.

## 4. Ports

- **Never run a harness on 3000 or 8000**, even when the snippet hardcodes them. They stay free for other apps, and per-repo ports let all harnesses run side by side.
- Use the doc's own override when it has one (`AGENT_URL`, `PORT`, `--port`). Otherwise change the port and mark the line `HARNESS`.
- A port change is not a finding unless the doc gives no way to change it.

| Repo | Frontend | Runtime | Backend |
|---|---|---|---|
| LangGraph-react | 3050 | (Next route) | 8050 (one `langgraphjs dev` server, all graphs; IPv6 `::1` only) |
| LangGraph-vue | 5150 (Vite) | 8150 doc server.ts · 8151 `sample_agent` · 8153 `frontend_tools_harness` | 8152 own backend (`agent/`, one `langgraphjs dev` server; IPv6 `::1` only) |
| Antigravity-react | 3040 | (Next route) | 8040 quickstart · 8041 interrupt · 8042 shared state · 8043 sub-agents · 8044 tool rendering · 8045 state rendering |
| Antigravity-vue | 5140 (Vite) | 8140 | 8141 own backend (`backend/`, quickstart agent) |

Each Vue repo runs its own backend; none depends on a React repo's servers at runtime.

## 5. FINDINGS.md

- Findings go in each repo's `FINDINGS.md`, never the README.
- Contents: **current open doc defects only.** No date sections, no resolved items, no harness notes.
- Header: one line on scope, then a `Stack:` line pinning installed vs declared versions (packages, Node/Python, OS) and the docs base URL + snapshot date.
- Numbers are stable IDs (`#N`, code cites `FINDINGS.md #N`). Never renumber; gaps are removed findings.
- Grouped by doc page (`### [Page title](doc url)`), three sections in this order:
  1. **Dev blockers**: errors that definitely show up with `npm run dev` / `ng serve` and normal use of the page (crash, thrown error, server won't start, install 404, feature does nothing). Quote the doc snippet (**Doc:**) and the exact error (**Error:** / **Result:**). Add **Confirmed by harness:** when a HARNESS change shows what was missing.
  2. **Minor notes**: one line each.
  3. **Build-only** (last): errors that appear only in `tsc` / `next build` / `vue-tsc` / `vite build`. Next dev never type-checks; `ng serve` does, so Angular TS errors are dev blockers.

## 6. Approval

- Never write a finding automatically from a page failure. Propose it; add it only after the owner approves.
- In the daily flow, Claude Code proposes findings after the local Haiku review, and **the owner approves them locally** before anything is written (see [REVIEW.md](REVIEW.md)). CI never writes findings.
- Exception (Antigravity React/Vue assignment of 2026-11-04 only): findings were logged directly and the owner reviewed at the end. Do not extend this to other repos or new work.

## 7. Temperature-only failures

When a page's published agent fails **only** because of a `temperature` value the model rejects (e.g. `temperature: 0` / `0.4` on `gpt-5-mini`):
- Record the clip **working** on a harness copy of the agent with `temperature` removed (`FIX` comment on that line).
- Highlight the temperature line on the doc, then a short casual Notepad note ("temp issue").
- Report row: ✅ with a short note. The original failing clip may be linked as "Issue + Fix ( Backend Code)".
- Any other defect on the page still follows sections 1 and 8.

## 8. Status criteria (be strict)

| Status | Use when |
|---|---|
| ✅ | The page works as documented (temperature-only case: see section 7). |
| ⚠️ | **Only** when the page's main feature works but there is a minor defect. |
| ❌ | The page's main feature does not work as documented. |

Lesson learned: many rows were marked ⚠️ when the feature didn't work (e.g. the agent says it rendered a card and no card appears). That is ❌. If in doubt whether the main feature works, it is ❌.

## 8a. Report as little as possible: 4 levels (owner, 2026-11-08)

Every explained error costs the owner work (explaining it, keeping it known every day). Report only what a reader of the page would really be stopped by, stay consistent with the previous tester (the QA team's testing doc, see REPORT.md), and never miss a big bug.

| Level | When | Report row | Clip | Voice-over | FINDINGS.md |
|---|---|---|---|---|---|
| **1. Blocker** ❌ | The page's main feature does not work when you follow the page: crash / won't compile or start with no obvious fix, nothing renders, the agent never replies, an error on every run, wrong-framework code, a missing piece that needs guesswork (frontend, backend, graph) | ❌ + one `Issue:` line (or the hard-failure block) | Full: doc → IDE → demo → doc highlight → Notepad | Yes, full script | Dev blockers entry |
| **2. Already reported** ⚠️/❌ | The team doc already flags the page and ours fails the same way | The team's emoji; the same problem in **our own short wording** when theirs is unclear or sloppy | Short: doc → IDE → demo, ends there (no highlight, no Notepad; doc-only pages keep the highlight). `KNOWN_ISSUE` in the repo's actions | Yes, short script (VOICE.md §5a) | Dev blockers entry |
| **3. Minor** ✅ | A developer fixes it in seconds: missing import / `"use client"` / obvious helper, wrong `runtime-url`, `.env` not loaded, `temperature`, a missing install step | ✅ `Working` + one short `Note:` | Plain working clip (obvious fix as a `HARNESS` line) | No | One line under *Minor notes* |
| **4. Ignore** | Type or build-only errors, the Next.js "N Issues" badge, cosmetic gaps, wrong comments, harness-only trouble | Nothing | Nothing | No | One line at most |

- **Team ✅ but ours is a level-1 blocker** → a *new big bug*: show the owner first (probe evidence); full clip only after approval.
- **Team ⚠️/❌ but ours works** → ✅ ("now working").
- `⚠️` only where the team used ⚠️ for the same problem.
- Anything that needs guesswork to fix stays level 1, even if a harness workaround exists.
- When unsure between levels 1 and 3, ask: would a reader following the page get stuck? Yes → 1. A minute of fixing → 3.

## 9. Scope: reachable pages only

We test as the human reviewer the company asked for: we were given the docs link for a framework and told to test it the way a reader uses it. Scope is what a person can reach by clicking through the docs, not every URL that exists.

| `reachable` (in `assignment.json`) | What it means | Tested? |
|---|---|---|
| `sidebar` | In the framework's sidebar section | **Yes, main focus.** Every one is recorded and reported. |
| `in-content` | Not in the sidebar, but linked from the text of a reachable doc page (a "see X" link, a card on the quickstart) | **Yes, secondary.** Recorded and reported. Note which page links to it. |
| `none` | Exists at a real URL, but nothing in the docs links to it: found only by guessing URLs, the `.md` export, `llms.txt`, a sitemap or automated crawling | **No.** Don't record, don't report, don't log findings for it. |

- **Out of scope by the owner's decision (2026-11-08), even when in the sidebar:** Intelligence pages (`intelligence/*`), Backend pages (`backend/*`) and Deploy pages (`deploy/*`, `deploy-*`). Don't add them to `assignment.json`, don't record, don't report.
- Doc changes and new package versions: [DRIFT.md](DRIFT.md). CI holds pages whose doc changed and installs what a new reader gets today.
- Automated fetching (drift check, `.md` export) is an internal tool only. A page it discovers counts only once it is in the sidebar or linked from a reachable page's content.
- CI records only `sidebar` + `in-content` pages that are not `excluded`, in parallel shards: 5 by default, 15 for LangGraph React (public repos: Actions minutes are free, up to 20 jobs at once). Shards are balanced by each page's recording time from the previous run (`page-durations.json`, kept in the Actions cache).
- Check by hand: new pages with no route or recorder entry, removed pages whose stale route still records a green clip, legacy code left beside new code, silent failures, React vs Vue/Angular divergence.

## 10. Secrets

- Never print, log, paste or commit API keys, `.env` files or key files (`4-private/.env`, any `*.env` / `*.env.txt`).
- The repos are public. The raw voice reference sample and API keys never go in them (see [VOICE.md](VOICE.md)).
