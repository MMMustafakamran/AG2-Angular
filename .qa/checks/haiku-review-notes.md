# Haiku review notes (reference)

Kept from the retired `qa-kit/review/` pipeline (`review.py`, `batch.py`, `prompts/{segment,overlay,approver}.md`),
deleted 2026-11-07. That pipeline ran headless `claude -p` calls per segment (haiku), an overlay
classifier (sonnet) and an approver (opus). It was replaced by: free checks here (`checks.py`) +
one independent Haiku agent per 5 clips, briefed by [instructions/REVIEW.md](../../instructions/REVIEW.md).
**REVIEW.md is the brief.** This file is background: wording and heuristics worth reusing.

## What the old pipeline measured

- Calibration run (16 clips, Windows 8 cores): 831 s wall; 2–7 min per clip; about $0.61 per clip,
  mostly per-call CLI overhead plus the opus approver.
- Images reached the model as base64 `image` blocks in one stream-json user message
  (`claude -p --input-format stream-json --output-format stream-json --verbose --tools "" --json-schema …`).
  Verified: haiku read Notepad title text off a 1280×720 JPEG frame.
- Concurrent CLI launches raced on `~/.claude.json` once ("corrupted"); launches were staggered 1.5 s.
- Frames per segment: every ~4 s (2–10 frames), plus recorder keyframes, plus every red-scan hit
  (an injected box can last only ~3 s), capped at 12–14.

## Segment kinds (what each should show)

| kind | marks | should show |
|---|---|---|
| doc | `doc`, `doc2` | docs.copilotkit.ai page under test, wheel-scrolled; sidebar framework/backend selectors match the clip |
| ide | `ide` | VS Code-style editor with the doc's code pasted verbatim (maybe package.json / versions); no annotations |
| demo | `demo`, `demo2`, `action`, `click`, `wait`, `error` | the app on localhost; the feature used, the result visible; long agent waits (spinner, unchanged screen) are normal; on a broken page the failure is visible |
| evidence | `evidence` (one per snippet) | back on the doc; the faulty text drag-selected (normal blue/grey browser selection) and held |
| notepad | `notepad`, `notepad2` | a Notepad window typing the finding, casual lowercase text |
| outro | `notepad-closed`, `end` | Notepad closed, clip ends |
| terminal | `console`, `terminal` | a log window; red text is normal |
| failure | `failure` | the intentional end-of-clip error terminal of a failed take ("the take failed; this is what the recorder saw", "Recorder verdict") |

## Overlay vs allowed red (from the overlay prompt)

Injected overlay (a violation): a red rectangle/outline hugging a page element, or a solid red
pill/label with white explanatory sentence text on top of the page (e.g. a red bar above a doc
callout saying "...and hides the code"), arrows, a "FINDING" banner. It usually sits on top of docs
content, doesn't match the docs site's dark design, and often comes with a coloured outline around
the neighbouring callout or code block.

Not overlays:
- the Next.js dev "N Issue" pill at the bottom-left, or the Next.js error overlay/dialog (real app errors: evidence)
- red text or highlighted lines in a terminal/log window, including the end-of-clip failure terminal
- a red error card rendered by CopilotKit or the app itself
- the docs site's own callouts: yellow/brown "Not available…", blue/purple "Not supported…", the purple top banner
- blue drag-selection, the Notepad window, red taskbar/tray icons

If unsure whether a red box is the app's or injected: call it injected only if it carries
explanatory sentence text about the defect or outlines a docs element.

## Evidence is easy to miss

A drag-selection is often a single line inside a dark code block (a blue/indigo band behind e.g.
`const AGENT_ID = "..."`) or one sentence in a callout. Scan code blocks and callouts line by line
on every doc frame after the demo. An empty "highlighted text" from a quick look is weak evidence:
before calling evidence missing, check the doc frames between the last demo frame and the first
Notepad frame.

## Notepad text

Casual: lowercase, short lines, loose punctuation, small typos (intended). Violations: headings,
numbered/bulleted lists, an ALL-CAPS "FINDING -" title, long `https://` URLs.

## Approver heuristics

- Don't invent problems: cheap reviewers over-report. Weigh each claim against the frames.
- Narration mismatches are minor unless the narration says the opposite of what is shown ("it works" over a crash).
- A confirmed injected overlay always ends as a rerecord, whatever else is right.
- If one look claimed an overlay but a dedicated look classed every red region as badge/terminal/app UI, believe the dedicated look.
- The Next.js "1 Issue" badge (`Date.now()` hydration mismatch in `CopilotKitProvider`) is a known cosmetic finding; it never changes a status alone.
- A ❌ clip whose demo works only with a HARNESS addition (showcase code, an agent file the doc never finishes), narrated/noted as such, is consistent with ❌.
- Harness failures that aren't the doc's fault (app not started, connection refused, wrong port, recorder crash) mean rerecord.

## Old output fields (for comparison)

Segment: `as_planned`, `observed`, `issues`, `red_overlay_seen`, `red_overlay_frames`, per-frame
`frame_kinds` (`doc_page`, `ide`, `app_demo`, `notepad`, `terminal`, `browser_other`,
`black_or_blank`, `desktop_other`), `app_outcome` (`works`/`fails`/`partial`/`not_shown`),
`notepad_text`, `highlighted_text`, `narration_matches`, `confidence` (< 0.7 re-ran on sonnet).
Approver: `verdict` (`pass`/`rerecord`/`finding_candidate`/`status_mismatch`), `observed_status`,
`reasons`, `top_issue`, `rule_violations`, `flagged_frames`, `summary`, `confidence`.
