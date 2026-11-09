# Clip review brief (one Haiku agent, 5 clips)

You are one of several independent reviewers. You get **5 recorded clips** from one CI run and
judge each one on its own. You never see the other agents' work and you never edit anything: you
only read and report. Claude Code decides from your verdicts; nothing you say is written to `FINDINGS.md`
or the report automatically ([QA-RULES.md](QA-RULES.md) §6).

Related: [QA-RULES.md](QA-RULES.md) (status criteria, verbatim code, HARNESS edits),
[AUTORECORDER.md](AUTORECORDER.md) (how clips are made), [VOICE.md](VOICE.md) (narration).
Background heuristics: `qa-kit/checks/haiku-review-notes.md`.

## 1. Where this sits

CI (no LLM): hold pages whose doc changed and resolve today's package versions ([DRIFT.md](DRIFT.md)) → record the other pages → re-attach saved narration to expected-failure clips at the new
marks (fit check flags lines that no longer fit) → `qa-kit/checks` → upload the run artifact.
Locally: Claude Code downloads the artifact and splits the clips 5 per Haiku agent (this brief)
→ Claude Code applies the verdicts (owner reviews afterwards) → clips go to `3-output/<date>/deliver/` → Loom links → HTML report.

## 2. Inputs per clip

| Input | Where | Use it for |
|---|---|---|
| Frames | `<clip>.frames/NNN-<label>.jpg` (recorder keyframes, one per mark and checkpoint) and `<clip>.checks/red-<t>s.jpg` (one per red run). Extract more with `ffmpeg -ss <t> -i <clip> -frames:v 1 -vf scale=1280:-2 f.jpg` when a segment has none or you need a closer look. | What is actually on screen |
| Timeline | `<clip>.timeline.json`: `marks` (segment starts), `checkpoints` (`expect` / `observed` / `ok`), `keyframes`, `durationS` | Which segment is where; what the recorder expected and read |
| Events | `<clip>.events.jsonl`: actions, console, `pageerror`, failed `network`, navigation | The exact error text and when it happened. The docs site logs its own errors: use the segment, not the raw count |
| Checks | `<clip>.checks.json` from `qa-kit/checks`: `issues`, `status_signals`, `look_at` (red runs), `freezes`, `black`, `events_summary` | Free facts: start here |
| Expected status | `assignment.json` → `pages[].status` (`✅` `⚠️` `❌`) for the page whose `links[].clip` is this clip | What the report currently says |
| Finding text | `assignment.json` → `pages[].findings` (numbers), `notes`, `block`; and those `#N` entries in the repo's `FINDINGS.md` | What the clip is supposed to show, including any HARNESS note |
| Narration script | `links[].narration` (`{clip, segments:[{at, text}]}`), plus the CI fit result (`<clip>.fit.json`, `lines[].flag`) | What the voice claims; lines CI flagged as not fitting |

Schema of timeline/events/frames: `qa-kit/recorder/SCHEMA.md`.

## 3. What a clip looks like

Segments in order, each starting at a mark:

| Segment | Marks | Shows |
|---|---|---|
| doc | `doc`, `doc2` | The docs page under test, wheel-scrolled, right framework selected in the sidebar |
| ide | `ide` | VS Code with the doc's code (maybe `package.json` / versions) |
| demo | `demo`, `action`, `click`, `error` | The app on localhost; the feature used, the result visible. Long agent waits are normal |
| evidence | `evidence` (one per snippet) | ❌/⚠️ only. Back on the doc, the faulty text drag-selected (normal blue selection) and held |
| notepad | `notepad` | ❌/⚠️ only. Notepad typing the finding in casual text |
| outro | `notepad-closed`, `end` | Notepad closed, end of clip |
| terminal | `terminal`, `console` | Optional log window; red log text is normal |
| failure | `failure` | Failed takes only: the **end-of-clip error terminal** (see rule b) |

## 4. Two rules that override first impressions

**(a) A demo running on showcase / HARNESS code is allowed** when the doc's code is incomplete and
the finding text or Notepad note says so (e.g. "the agent file never builds a graph, I added the
rest from the showcase"). That is the finding being demonstrated, **not a rerecord** and not a
status mismatch: the page is still ❌ because it doesn't work *as published*. Only flag it when
the clip hides that a harness addition was needed (no note, no narration, and the report says ✅).

**(b) The terminal window at the end of failure clips is intentional.** A failed take ends with a
window titled `Error console — <page-id>`: a real bash session where `ls logs/`, `tail -n 25
<log>` and `grep -n -i -E ... <log>` are typed and their real output shown. It shows the viewer the real terminal error.
**Never flag it**: not as an overlay, not as a glitch, not as "a harness failure on screen". Its
red text is not an overlay. Do read it, and read `logs/<page-id>.error.log`: its **Recorder verdict** section (not on camera) is the recorder's summary of the error.

Also never flag: a Next.js error overlay (real errors, evidence; the "N Issues" badge is turned off on purpose, `devIndicators: false`), a red
error card rendered by CopilotKit or the app, the docs site's own callouts (yellow "Not
available…", blue/purple "Not supported…"), blue drag-selection.

## 5. What to flag

**Blockers only** ([QA-RULES.md](QA-RULES.md) §8a): flag a page failure only when the main feature visibly fails (crash, nothing renders, no reply, error card). Missing imports, harness helpers, type errors, temperature, cosmetic gaps are *minor*: mention them in `observations` at most, never as a flag or a status change. A ✅ page that needed an obvious HARNESS fill-in is still ✅.


| Flag | Meaning |
|---|---|
| known failure now works | Expected ❌/⚠️, but the demo plainly does what the doc promises and no defect shows. Checks hint: `status_signals` "every checkpoint passed". |
| failure's error changed | Still failing, but the on-screen error / the `.error.log` Recorder verdict / the Notepad error differs from the finding text (another message, another place, another cause). |
| ✅ page now fails | Expected ✅, but the demo shows an error, nothing rendered, a failed checkpoint, or the failure terminal. |
| glitch | Black stretch, frozen screen past a plausible wait (`checks.freezes[].ok == false`), marks out of order or past the end, clip cut off, a step that clearly misfired (cursor clicking nothing, wrong page, stuck loading), harness trouble that isn't the doc's fault (server not running, connection refused, wrong port, recorder crash before the demo). |
| injected overlay | Anything drawn onto the page by the recorder: red boxes/outlines, caption pills with explanatory text, arrows, "FINDING" banners. Check every `checks.look_at` red run frame. |
| missing segment | Level-1 ❌ clip without demo → evidence (drag-select) → Notepad (level-2 pages, `KNOWN_ISSUE`, end after the demo on purpose: not missing); ✅ clip with a Notepad (except the temperature-only case, [QA-RULES.md](QA-RULES.md) §7). |
| formal Notepad | Headings, numbered/bulleted lists, ALL-CAPS title, long `https://` URLs. Casual lowercase with small typos is correct. |
| audio-fit | CI's fit flagged a narration line (`overlap`, `gap`, `past-end`): the saved line no longer fits the new marks. Report the line and the flag; never rewrite it (rewrites are local only). |
| status honesty | ⚠️ is only for "main feature works, minor defect". If the main feature fails, the right status is ❌: flag it. If in doubt whether the main feature works, it is ❌. |

## 6. Verdict per clip (first match wins)

| Verdict | When |
|---|---|
| `rerecord` | Injected overlay, glitch, missing segment, formal Notepad, harness trouble. The clip can't be delivered as is. |
| `new_failure` | Expected ✅, the page now fails. |
| `finding_resolved` | Expected ❌/⚠️, the known failure now works. |
| `finding_changed` | Still failing, but the error differs from the finding text. |
| `status_mismatch` | The clip is valid, but the expected status is wrong for what it shows (e.g. ⚠️ where the main feature fails; ❌ where the page works as published and no doc defect shows). |
| `pass` | Valid clip, consistent with the expected status and finding text. |

Audio-fit flags don't change the verdict on their own: report them in `audio_fit`.

## 7. Output

One JSON object per clip, in a JSON array of 5:

```json
{
 "clip": "LANGGRAPH-react-04-UseInterrupt",
 "expected_status": "❌",
 "verdict": "pass",
 "observed_status": "❌",
 "observations": [
  {"t": 41.5, "segment": "demo", "text": "interrupt picker shows 'Tomorrow 2:00 PM'; demo uses the showcase graph (harness note in finding #7)"},
  {"t": 88.0, "segment": "evidence", "text": "'Not supported on LangGraph (TypeScript)' drag-selected"}
 ],
 "on_screen_errors": ["exact quote of an error on screen (or in the .error.log Recorder verdict, marked as such), with t"],
 "notepad_text": "exact quote of the Notepad note (best effort)",
 "audio_fit": [{"at": "demo2", "flag": "overlap"}],
 "flags": ["injected overlay 126-140s"],
 "confidence": 0.8
}
```

- `observations`: what you saw, each with a time in seconds and the segment, most important first.
- Quote on-screen errors and Notepad text **exactly** (they are compared with the finding text).
- `flags`: short strings from §5; empty for a clean pass.
- `confidence` 0–1. Below 0.6 when frames are unreadable, a segment has no frames, or you
  inferred instead of saw. Say what would settle it.
- Don't invent problems. Each claim needs a frame, an event, or a checks field behind it.

## 8. Calibration (2026-11-07)

A single Haiku agent at high effort over 5 known clips got **3/5 right**:

- It wrongly said **rerecord** for UseInterrupt because the demo ran on showcase code. That is
  allowed (rule a); the finding text said so. Fix: read the finding text before judging the demo.
- It flagged **Reasoning ⚠️ as really ❌** (main feature not working). That flag was **correct**:
  ⚠️ means the main feature works. Keep raising it.
