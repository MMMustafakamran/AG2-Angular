# qa-kit/checks

Free, deterministic checks for recorded clips. No LLM, no secrets, no network: safe in CI.
Their output is one of the inputs of the Haiku clip review ([instructions/REVIEW.md](../../instructions/REVIEW.md)).

Needs Python 3.10+ with `numpy`, and `ffmpeg`/`ffprobe` on PATH.

## One clip

```sh
python 2-shared/qa-kit/checks/checks.py videos/X.webm [--timeline T] [--events E] [--expect-status ❌] \
  [--note "finding text"] --out out/checks [--no-frames] [--fail-on-issues]
```

`--timeline` / `--events` default to `<clip>.timeline.json` / `<clip>.events.jsonl` beside the video
(schema 1 or 2: [recorder/SCHEMA.md](../recorder/SCHEMA.md)). Writes `out/checks/<clip>.checks.json`
and `out/checks/<clip>.checks/red-<t>s.jpg` (one frame per red run). Never touches the clip.

| Check | Lands in |
|---|---|
| duration (< 15 s, > 600 s), timeline `durationS` vs video (> 3 s apart) | `issues` |
| blackdetect (≥ 1 s; a short fade at start/end is fine) | `black`, `issues` |
| freezedetect (≥ 8 s) judged per segment: demo 90 s, ide 40, doc/evidence/notepad 25, outro/terminal 30, failure 40 | `freezes`, `issues` |
| marks in order, inside the video, first mark ≤ 3 s, no unmarked tail > 45 s | `marks`, `issues` |
| required segments: doc + demo; ❌/⚠️ also evidence + notepad; ✅ has no notepad unless `--note` mentions temperature | `segments_required`, `issues` |
| page errors, console errors, failed requests, failed recorder actions (events.jsonl), failed checkpoints (timeline v2), each tagged with its segment | `events_summary`, `status_signals`, `warnings` |
| `failure` mark (take failed; the intentional failure terminal follows) | `status_signals` for ✅, else `warnings` |
| red-pixel scan, 1 fps at 480×270: R > 170, G < 90, B < 90, ≥ 40 px, taskbar strip ignored; runs split where the count jumps | `red_runs`, `look_at` |

Result keys: `ok` (no `issues`), `issues` (recording problems, likely a rerecord), `status_signals`
(evidence against the expected status: e.g. ✅ with demo page errors, or ❌ where every checkpoint
passed), `look_at` (red runs to inspect), `warnings`.

**Red runs are reported, never judged.** Each run has `start`, `end` (inclusive second), `dur`,
`peak` px, `box` (at 480×270), `t`, `segment`, `kind`, `frame`, and a `context` hint: inside the
`failure` or a `terminal` segment (red log text, expected), or the bottom-left Next.js badge
position (`likely_nextjs_badge`). Those are kept out of `look_at`. Everything else goes to
`look_at` for the reviewer: an injected overlay (rerecord), or allowed red such as a CopilotKit
error card. Older (v1) timelines have no `failure` mark, so red in the end-of-clip terminal shows
up under the last segment (e.g. `notepad-closed`).

Exit code is 0 unless `--fail-on-issues` and there are issues.

## Many clips

```sh
python 2-shared/qa-kit/checks/batch.py videos/ --out out/checks --jobs 3 [--expect ✅]
python 2-shared/qa-kit/checks/batch.py manifest.json --out out/checks
```

Inputs: folders (`*.webm`, plus `*.mp4` without a matching `.webm`), single clips, a `.txt` list,
or a `.json` manifest `[{clip, timeline?, events?, expect_status?, note?}]`. Writes `summary.md` +
`summary.json`. A clip that crashes is reported, the batch goes on.

## Tested (2026-11-07)

| Clip | Result |
|---|---|
| `Antigravity-react/Antigravity-reupload/ANTIGRAVITY-react-05-HeadlessInterrupts.webm` (❌, voice timeline) | ok; `look_at`: red 126–132 s and 134–140 s (the old injected red caption + outline). Badge 38–120 s and console 194–200 s kept out of `look_at` |
| `LangGraph-upload/LANGGRAPH-react-22-PrebuiltChat.webm` (✅, no timeline) | ok, clean: only the Next.js badge (41–74 s) |
| `LangGraph-upload/LANGGRAPH-react-04-UseInterrupt.webm` (❌) | ok, clean (badge only) |
| `LangGraph-react/autorecorder/videos/LANGGRAPH-react-33-FrontendCards.webm` (❌, v1 timeline) | ok; `look_at` 118–124 s = the intentional failure terminal (no `failure` mark in v1) |
| synthetic v2 timeline + events on PrebuiltChat (✅) | page error / 500 / failed checkpoint / failed action tagged `demo+action`; `failure` mark → `status_signals` |

Full run: ~40 s wall for 4 clips (50–200 s each) with `--jobs 4`.

Older LLM pipeline notes: [haiku-review-notes.md](haiku-review-notes.md).
