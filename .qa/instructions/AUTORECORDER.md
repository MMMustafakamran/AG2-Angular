# Autorecorder rules

Applies to every repo's `autorecorder/` (`cli.ts` → `core/engine.ts` → `actions/*.ts`; config in `config/{pages,project,selectors}.config.ts`; output in `videos/`). Commands per repo: `npm run record[:all|:list|:doctor]`.

## 0. Probe first, film last (owner, 2026-11-08)

Two tools, two jobs:

| Tool | When | What it does |
|---|---|---|
| **probe** (`npx tsx ../.qa/tools/probe.mts <page-id>... [--all] [--prompt ".."] [--headed] [--video]`, run from `autorecorder/`) | Exploring a page, checking a finding, verifying a fix, anything where the result isn't known yet | Headless, parallel (3 at a time). Opens the demo route, types the prompt, waits for the reply to settle, saves `videos/probe/<page>/final.png`, a screenshot every 5 s and `result.json` (reply text, errors on screen, console errors, failed requests, timing). No doc tour, IDE, Notepad or humanizing. ~20-60 s per page. |
| **record** (`npm run record -- <page-id>`) | Only once a page's status and finding text are final | The full humanized clip for delivery (sections 1-4). |

Never use a full humanized take to find out what a page does.

## 1. Clips must look hand-recorded

- Scroll with the real mouse wheel. Move the cursor with the human glide helpers.
- Highlight faulty text the way a person would: drag-select it with the mouse, then pause on it.
- **Never inject anything onto the page:** no red boxes, outlines, captions, labels or arrows. All explanation goes in Notepad (and narration).
- **The terminal window at the end of failure clips is intentional, keep it.** A failed take ends with the `Error console — <page-id>` window: a **real shell** (bash via node-pty in the repo root) where `ls logs/`, `tail` and `grep` on the server logs are typed live, so the viewer sees the real terminal error. It shows **only what that shell printed** (no header, no summary; the browser console stays in the `.error.log`): the recorder's own "Recorder verdict" summary goes to `videos/logs/<page-id>.error.log`, never on camera, because a page action can write that text in advance. It is not an injected overlay and reviewers never flag it. Produced by `core/engine.ts` `showFailureEvidence()` + `core/failure-terminal.ts` + `core/failure-evidence.ts` (see `qa-kit/recorder/README.md`).
- The old Antigravity clips (`Antigravity-react/autorecorder/actions/antigravity.actions.ts`, `FINDING_NOTES` / `writeFinding`) still use red outlines and captions. **They must be re-recorded** with the LangGraph-style evidence step before delivery.

## 2. Finding clips (❌ / ⚠️ pages)

Order: **demo → back to the doc → highlight each faulty snippet → Notepad note.**

1. Demo: show the defect happening in the app (crash, error banner, nothing rendered).
2. Go back to the doc page. For each faulty snippet or sentence (empty or cut-off snippet, undefined identifier, wrong-framework code, "Not supported" banner): wheel-scroll to it, drag-select it, pause. Click a language tab first if the snippet sits behind one.
3. Notepad: open it from the simulated taskbar and type the finding.

**Check every evidence text against the rendered page, not the `.md` export.** The two can differ.

### Notepad note

- About **8 lines**: the `FINDINGS.md` number(s), what the doc says, what actually happened, the harness fix if any. A viewer who skips the doc and code segments must still know what broke.
- **Typed like the owner types in a hurry** (owner, 2026-11-08): no capital letters at all in prose, no headings or list markers, almost no full stops, sloppy spacing (missing space after a comma, the odd double space, two short words run together), chat shorthand (u, ur, dont, isnt, thats, pls), several typos left in plus a few fixed with backspace.
- Code, file paths, numbers and the finding number stay exact (they are the evidence); `FINDINGS.md` may be typed as `findings.md`.
- **No long URLs.** Drop the scheme (`https://`, `http://`, `wss://`, `ws://`): `https://example.com/x` → `example.com/x`.
- Always pass the note through `humanizeNote()` (shared: `core/overlays/note-style.ts`) and type it with `typeInNotepad`, which treats `'\b'` as a backspace. Deterministic per note, so a re-record types the same thing. Write the note text plainly; the style is applied by `humanizeNote`.
- Call `openNotepad` / `typeInNotepad` / `closeNotepad` from the page's action, not from `core/`.

## 3. Working clips (✅ pages)

- No Notepad segment, no doc-evidence step.
- Exception: temperature-only pages get the temperature line highlighted and a short "temp issue" note ([QA-RULES.md](QA-RULES.md) section 7).

## 4. Timeline marks

- Every clip emits a mark at the start of each segment with `mark(label, detail?)` from `core/timeline.ts`. Labels in use: `doc`, `ide`, `terminal`, `demo`, `action`, `click`, `error`, `evidence` (one per highlighted snippet, detail = the text), `notepad`, `notepad-closed`, `failure` (failed take: the error terminal follows), `end`.
- The timeline is saved next to the video as `<clip>.timeline.json` (schema 2: `marks` plus `checkpoints`, `keyframes`, `durationS`), with `<clip>.events.jsonl` and `<clip>.frames/`. `t` in seconds from video start. Contract: `qa-kit/recorder/SCHEMA.md`.
- Narration lines attach to these labels ([VOICE.md](VOICE.md)). A missing mark means the clip can't be narrated. A new segment type needs a new `mark()` at its start.

## 5. Reference implementation (copy when porting)

| What | Where |
|---|---|
| `humanizeNote()`, `showDocEvidence()`, `FINDING_EVIDENCE`, `writeFinding()`, `dragSelect()` | `LangGraph-react/autorecorder/actions/langgraph.actions.ts` |
| Notepad overlay: `openNotepad`, `typeInNotepad` (`'\b'` = backspace), `closeNotepad` | `LangGraph-react/autorecorder/core/overlays/notepad.ts` |
| Timeline: `startTimeline`, `mark`, `saveTimeline` | `LangGraph-react/autorecorder/core/timeline.ts` |

`FINDING_EVIDENCE` entry: `{ text, caption, clickTab? }`. `text` is matched on the rendered page; `caption` goes to the recorder log only, never on screen.

Each repo is handed off alone: vendor a copy of shared recorder code into it (no `file:` deps, no sibling-folder imports). Master core: `qa-kit/recorder/core/` (`2-shared/qa-kit/sync.sh` writes it to each repo's `autorecorder/core/`, guarded by `CORE_MANIFEST.json`).
