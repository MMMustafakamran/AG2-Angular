# Voice narration rules

Applies to every clip that reports a broken doc page: level 1 (blocker, full script) and level 2 (already reported ⚠️/❌, short script) of [QA-RULES.md](QA-RULES.md) §8a. Working and minor-issue clips have none. The narration covers the whole video, in the owner's cloned voice, as if recorded live.

## 1. Voice

- Service: **Fish Audio**, free model `s2.1-pro-free` (header `model: s2.1-pro-free`).
  Key: `FISH_API_KEY` in the workspace `4-private/.env` locally, a GitHub secret in CI. **Never print or commit it.**
- No saved voice on the free tier: each request sends the reference clip + its transcript.
  - Reference: `4-private/voice-private/reference-new.wav` (102 s of the owner talking naturally through a testing script, recorded 2026-11-08; cleaned: high-pass, levelled, mono 44.1 kHz). The old `reference-20s.wav` is kept but no longer used.
  - Transcript: `4-private/voice-private/reference-new.txt` (faster-whisper, technical terms corrected by hand).
  - Tool: `qa-kit/narrate/narrate.py` (tts, fit, mix, rewrite; see its README).
- Chatterbox (HF demo) was tried and rejected: robotic, didn't sound like the owner (Indian accent). Sarvam is blocked in the owner's region.
- Known limit: tone stays fairly even through a clip. Accepted as good enough (2026-11-07).

## 2. What may be public

- Generated narration audio **may** be committed to the public repos.
- The raw voice reference samples (`4-private/voice-private/*.wav`, `*.mp4`) and all API keys **must never** be committed. CI never needs them: it only reuses saved mp3 lines.

## 3. Video

- **No cuts.** The video stays exactly as recorded; the narration fits the real timing.
- **Silences are fine** (owner, 2026-11-08): no need to fill agent waits with talk. During a silence the room tone keeps playing, so it never sounds dead.
- **No click or typing sounds** (owner, 2026-11-09): voice + room tone only (`narrate.py mix` adds clicks only with `--foley`).
- **Background:** constant room tone (low fan hum + faint hiss), **steady at one fixed level for the whole clip** (no fades or ducking), slightly audible: ~20–24 dB below the voice. Gaps never sound digital.

## 4. Lines and slots

- Each script line is attached to a timeline mark label: `label` (first occurrence) or `label#n` (nth occurrence, 1-based), e.g. `doc`, `ide`, `demo`, `evidence#2`, `notepad`. Labels: [AUTORECORDER.md](AUTORECORDER.md) section 4. A second line in the same segment uses `at: "+"` (starts right after the previous line), never an invented label like `demo2`.
- A line's slot runs from its mark to the next mark. Each line is generated separately and placed at the start of its slot.
- **A line must fit its slot: never overlap the next segment.** If it would, shorten it.
- Gaps between lines are allowed (the fit check reports them but never flags them).
- Size each line at **~2.5 words/second** of slot length.

## 5. Script rules (owner's instructions)

1. **Doc page:** don't explain what the page or feature is. Only say which page we're on and for which framework, then "and I have implemented this page / this code".
   - e.g. "Ok so, this is the frontend-driven cards page in the CopilotKit docs, for LangGraph TypeScript, and I have implemented this page in my project."
2. **No timing-specific lines.** The voice can't be synced to an exact click or moment, so never say "let me click it", "now I'm typing", "there it is". Say it generically, as a result:
   - ✗ "let me click it… and yeah, there's the card"
   - ✓ "after clicking the button, the card said deployment finished"
3. **VS Code part:** "this is my project, this is the exact code from the doc". **Never say a version number** anywhere in the narration (owner, 2026-11-09): versions change often and every mention would need new audio. The versions file on screen shows them.
4. **Demo:** "moving on to the demo", then what happened and the problem, stated as results.
5. **Highlight + Notepad:** while the doc code is highlighted the voice points at it; once the note is pasted, the voice reads out / explains the issue while Notepad stays open (the recorder holds Notepad until these lines end). Same content as the note, not word-for-word.
6. **Ending:** always a short, polite ask to fix it, but **vary the wording between clips**. Never reuse the same ending in two clips of one batch. Pool:
   - "So yeah, this is the issue, kindly fix it."
   - "So kindly look into it."
   - "That's the problem here, please have a look."
   - "So this needs a fix, kindly check it."
   - "That's it for this one, kindly look into this issue."
   - "So yeah, please take a look and fix this."
   - "That's what's breaking here, kindly have it fixed."
   - "So umm, this one needs fixing, please look into it."
   - "Alright, that's the issue, kindly sort it out."
   - "So yeah, kindly check this and fix it."
7. Style: casual, short sentences, natural fillers ("ok so", "basically", "yeah"), plus **a few "umm" / "uh" / "ahh"** (one or two per segment, at natural hesitation points, not every sentence). Don't over-explain. Spell out what TTS would misread ("example dot com").

## 5a. Short script (level 2: already reported)

The clip is doc → IDE → demo and ends there. Three to four lines:
1. `doc`: the page + framework, "and I have implemented this page" (rule 1).
2. `ide` (optional): "this is the code from the doc".
3. `demo`: "moving on to the demo", then what went wrong, as a result (rule 2), in one or two sentences. Same problem as the report row.
4. `+` after the demo line: a varied polite ending (rule 6).

No reasons or root-cause explaining: the team already reported it.

## 6. Reuse

- Audio is saved per finding (by finding number + exact script text).
- Same error the next day, same script → reuse the saved audio. New or changed error → generate only that finding's lines.
- Lines that would change every run (e.g. wait filler) are separate short pieces, regenerated cheaply. Versions are never spoken (§5 rule 3).

## 7. Review and checks before handing a clip over

- **No script approval needed (owner, 2026-11-09):** Claude Code writes the script and generates the audio locally (never in CI), then lists new scripts in its summary.
- No voice cut off by the next segment. Silences are fine; the room tone must be audible through them.
- Background level steady; transitions listened to.
