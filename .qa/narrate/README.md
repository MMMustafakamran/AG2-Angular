# narrate

Voice-over for recorded QA clips in the owner's cloned voice (Fish Audio `s2.1-pro-free`),
placed on the clip's timeline marks over a steady room tone. No video cuts.
Script rules (what the lines say, how long they are): `instructions/VOICE.md`.

Needs Python 3.9+, `requests` + `ormsgpack` (only for `tts`), `ffmpeg`/`ffprobe` on PATH, and the
`claude` CLI (only for `rewrite`).

## CI vs local

| Command | Where | Needs |
|---|---|---|
| `fit` | CI + local | nothing secret. Uses saved audio when the cache key resolves, else estimates (words / 2.5) |
| `mix` | CI + local | saved audio for every line (fails otherwise), ffmpeg. No key, no reference wav |
| `voice-id` | local (once) | the reference wav; writes `narration/voice.json` for CI |
| `tts` | **local only** | Fish key + reference wav/transcript. In CI it only succeeds when every line is already cached (no Fish call); a missing line exits with "tts runs locally only" |
| `rewrite`, `all` | **local only** | `claude` CLI (and `tts` for `all`) |

CI never makes new audio or rewrites lines: it re-attaches **saved** audio at the new marks
(`mix`) and runs `fit` to flag lines that no longer fit (`overlap`, `gap`, `past-end`). New lines
and LLM rewrites happen locally, after the owner reviews the script.

**How CI finds saved audio without the wav.** The cache key includes the sha256 of the reference
wav. Without the wav, `narrate.py` takes it from, in order: `VOICE_REF_SHA256` env →
the wav itself (local) → `narration/voice.json` (`{"refSha256": "…"}`, found upward from the cwd,
or `NARRATE_VOICE_JSON`). The sha is not a secret (you can't get the voice from it); commit
`narration/voice.json` with the repo's narration audio. Make it locally with:

```sh
python 2-shared/qa-kit/narrate/narrate.py voice-id --write <repo>/narration/voice.json
```

Tested 2026-11-07 (use-interrupt, `LangGraph-upload/LANGGRAPH-react-04-UseInterrupt.webm`): `mix`
from an isolated folder with no wav, no transcript, no key and no legacy cache produced a file
byte-identical to the original `narrate.py` with the wav (both via `voice.json` and via
`VOICE_REF_SHA256`); `fit` gave the same table from real audio durations.

## Inputs

- **Script** `{clip, segments:[{at, text}]}`. `at` = `+` means the line follows the previous one in the same segment (0.35 s breath). Otherwise `at` is a timeline mark label: `label` = first
  occurrence, `label#n` = nth (1-based).
- **Timeline** `{clip, marks:[{t, label}]}` (v1) or v2 (`schema:2`, plus `checkpoints`,
  `keyframes`, `durationS`). Only `marks` and `durationS` are read.
- **Clip** `.webm` as recorded.

A line's slot runs from its mark to the next mark (the last one to the clip end). The voice starts
0.6 s after the mark.

## Commands

```sh
N=qa-kit/narrate/narrate.py

python $N fit     script.json clip.timeline.json [--clip clip.webm] [--out F] [--max-overlap 0.3] [--max-gap 15]
python $N tts     script.json
python $N mix     script.json clip.webm clip.timeline.json out.mp4
python $N rewrite script.json clip.timeline.json --fit clip.fit.json [--out S] [--in-place] [--model sonnet|opus]
python $N all     script.json clip.webm clip.timeline.json out.mp4 [--model sonnet] [--no-rewrite] [--in-place] [--strict]
python $N import-cache narration/scripts/*.json --from OLD_CACHE_DIR   (one-off; legacy cache already imported)
python $N voice-id [--write narration/voice.json]
```

All take `--audio-dir D` (except `rewrite`).

- **fit**: per line: slot start/end, spoken length (from cached audio, else words / 2.5), overlap
  into the next slot and silence left after it. Writes `<script dir>/<clip>.fit.json` (or `--out`)
  and prints a table. Flags: `overlap` (> 0.3 s), `gap` (> 15 s), `past-end` (mark is after the clip
  end: the timeline is for another recording). Exit 1 if anything is flagged, 2 if a script label is
  missing from the timeline. Fit never writes audio. Clip length comes from `durationS`, else
  ffprobe on `--clip` or `<clip>.webm` next to the timeline / under `*/autorecorder/videos/`.
- **tts**: generates only lines missing from the cache (Fish returns wav; it is encoded to
  `<key>.mp3` and the wav is dropped). Retries on 429/5xx.
- **mix**: same output as the old `voice/narrate.py`: lines at mark + 0.6 s, voice loudnorm
  -16 LUFS, brown-noise fan + 110 Hz hum at one fixed level, H.264 CRF 20 + AAC 160k, clip length
  unchanged. Reads `.mp3` or `.wav` lines. Fails if a line has no audio (run `tts` first).
- **rewrite**: sends only the `overlap`/`gap` lines to Claude (via `claude -p --output-format json
  --tools ""`, prompt on stdin) with `instructions/VOICE.md` and the whole script as context, sized
  to the slot at 2.5 words/s (between 75 % and 100 % of `(slot - 1.6 s) * 2.5` words). Word counts
  are checked and misses are sent back (up to 3 tries). Writes `<script>.rewritten.json` (or `--out`;
  `--in-place` overwrites) plus `<that>.diff`. If `claude` is missing or fails, it prints why, leaves
  the script alone and exits 1. Review the diff: the prompt forbids made-up facts, but check anyway.
- **all**: fit -> rewrite (max 2 rounds, on estimates) -> tts -> fit again on real audio (written
  next to `out.mp4` as `<out>.fit.json`) -> mix. Still-flagged lines only warn unless `--strict`.

## Cache

`<audio-dir>/<key>.mp3` + `<key>.json` (`text, model, refSha256, duration, file, clip, at`).
Lookup takes `<key>.mp3` first, else `<key>.wav` (older caches still work); `fit` and `mix` read
either, and durations always come from the actual file via ffprobe (the json `duration` is
informational). New audio (`tts`, legacy import) is written as mp3: libmp3lame CBR 192 kbps
(`NARRATE_MP3_BITRATE` to change), source sample rate and channel count kept (Fish audio is
44.1 kHz mono), checked to decode and to be within 0.05 s of the source before it is kept.
To convert an existing wav cache: encode each `<key>.wav` the same way, re-measure `duration` and
set `file` in `<key>.json`, then delete the wav (done for the four QA repos 2026-11-07: 127 MB of
wav -> 35 MB of mp3).
`key = sha256(text + model + sha256(reference wav))[:32]`, so changing a line's text, the model or the
reference voice regenerates only that line.

Audio dir: `--audio-dir`, else `NARRATE_AUDIO_DIR`, else `<workspace>/voice-private/audio` locally, else
`./narrate-audio`.

**Legacy cache** (`voice/cache/<sha1(text)[:16]>.wav`, from the old `voice/narrate.py`, always
`s2.1-pro-free` + `reference-20s.wav`): `tts`/`mix` import a matching file into the new cache on
first use (encoded to `<key>.mp3`); `fit` reads it in place. `import-cache` does it for whole scripts.
Found automatically at `<workspace>/voice/cache`, or set `NARRATE_LEGACY_CACHE`.

## Environment

| var | used by | default |
|---|---|---|
| `FISH_API_KEY` | tts | local `FISH_API_KEY` in the workspace `4-private/.env` |
| `VOICE_REF_WAV`, `VOICE_REF_TXT` | tts, cache keys | local `4-private/voice-private/reference-20s.wav` / `.txt` |
| `VOICE_REF_SHA256` | cache keys without the wav | sha256 of `VOICE_REF_WAV`, else `narration/voice.json` |
| `NARRATE_VOICE_JSON` | cache keys without the wav | `narration/voice.json` found upward from cwd |
| `FISH_MODEL` | tts, cache keys | `s2.1-pro-free` |
| `NARRATE_AUDIO_DIR`, `NARRATE_LEGACY_CACHE` | cache | see above |
| `NARRATE_MP3_BITRATE` | tts, legacy import | `192k` |
| `NARRATE_LLM_MODEL` | rewrite | `sonnet` |
| `NARRATE_VOICE_RULES` | rewrite | `instructions/VOICE.md` found upward from cwd |
| `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` | rewrite (read by `claude`) | |

Never commit the key or the reference wav/transcript (VOICE.md section 2). Generated narration audio
may be committed.

## CI (GitHub-hosted runner): no secrets

```yaml
- run: sudo apt-get update && sudo apt-get install -y ffmpeg
# no Fish key, no voice sample, no LLM: only saved audio (committed under narration/audio)
- run: |
    for s in narration/scripts/*.json; do
      clip=$(python -c "import json,sys;print(json.load(open(sys.argv[1]))['clip'])" "$s")
      python .qa/narrate/narrate.py fit "$s" "videos/$clip.timeline.json" --audio-dir narration/audio --out "out/$clip.fit.json" || true
      python .qa/narrate/narrate.py mix "$s" "videos/$clip.webm" "videos/$clip.timeline.json" "out/$clip.mp4" --audio-dir narration/audio
    done
```

- The reference sha256 comes from the committed `narration/voice.json` (or `VOICE_REF_SHA256`).
- `fit` exits 1 when a line is flagged; CI records the flag (in `<clip>.fit.json`) and goes on.
  The local reviewer sees it ([instructions/REVIEW.md](../../instructions/REVIEW.md), "audio-fit").
- A script line with no saved audio makes `mix` fail for that clip: that is a new line, generate it
  locally (`tts`) and commit the audio.
- Never put the Fish key or the reference wav/transcript in CI or the repo (VOICE.md section 2).
  The key is only ever sent in a request header and never printed; errors show the HTTP status and body only.
