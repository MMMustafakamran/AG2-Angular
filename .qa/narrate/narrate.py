#!/usr/bin/env python3
"""Narrate a recorded QA clip in the owner's cloned voice (Fish Audio), CI-ready.

Rules for the script text: instructions/VOICE.md.

Subcommands
  fit     <script> <timeline> [--clip C] [--audio-dir D]     slot/duration report, writes <clip>.fit.json
  tts     <script> [--audio-dir D]                           generate only the missing lines
  mix     <script> <clip.webm> <timeline> <out.mp4>          voice + steady room tone, no cuts
  rewrite <script> <timeline> --fit F [--out S] [--in-place] LLM-rewrite only the flagged lines
  all     <script> <clip.webm> <timeline> <out.mp4>          fit -> rewrite (<=2 rounds) -> tts -> mix
  import-cache <script...> --from DIR                        copy legacy voice/cache entries into the new cache
  voice-id [--write narration/voice.json]                    print/save the reference sha256 (cache key, not secret)

CI-safe (no Fish key, no reference wav, no LLM): fit, mix, voice-id. The cache key's reference
sha256 then comes from VOICE_REF_SHA256 or narration/voice.json. Local only: tts, rewrite, all.

Pure stdlib + requests/ormsgpack (tts only) + ffmpeg/ffprobe on PATH.
"""
import argparse, difflib, glob, hashlib, json, math, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get("FISH_MODEL", "s2.1-pro-free")
WPS = 2.5                 # words per second used to size lines
LEAD = 0.6                # a line starts this long after its mark (a person reacting)
MAX_OVERLAP = 0.3         # fit fails above this
MAX_GAP = float("inf")    # silences are fine (owner, 2026-11-08): gaps are reported, never flagged
REWRITABLE = ("overlap", "gap")
FISH_URL = "https://api.fish.audio/v1/tts"


# ---------------------------------------------------------------- environment

def _workspace_candidates():
    """Directories that may hold fishaduio.env / voice/ when running locally (not in CI)."""
    seen, out = set(), []
    for d in [os.getcwd(), HERE]:
        d = os.path.abspath(d)
        while True:
            if d not in seen:
                seen.add(d); out.append(d)
            p = os.path.dirname(d)
            if p == d:
                break
            d = p
    return out

# Workspace layout: secrets + voice sample in 4-private/, rules in 2-shared/ (never in a repo).
_LOCAL_SUBDIRS = ("", "4-private", "2-shared")

def _find_local(rel):
    for d in _workspace_candidates():
        for sub in _LOCAL_SUBDIRS:
            p = os.path.join(d, sub, rel) if sub else os.path.join(d, rel)
            if os.path.exists(p):
                return p
    return None

def fish_key():
    k = os.environ.get("FISH_API_KEY", "").strip()
    if k:
        return k
    # Look through every .env above the cwd (and 4-private/), not just the first one found:
    # other tools (e.g. the CopilotKit CLI) may drop their own .env higher up.
    for d in _workspace_candidates():
        for sub in _LOCAL_SUBDIRS:
            p = os.path.join(d, sub, ".env") if sub else os.path.join(d, ".env")
            if os.path.isfile(p):
                for line in open(p, encoding="utf8"):
                    if line.startswith("FISH_API_KEY="):
                        return line.split("=", 1)[1].strip()
    sys.exit("error: FISH_API_KEY not set and not found in any workspace .env (4-private/.env)")

def ref_paths():
    wav = os.environ.get("VOICE_REF_WAV") or _find_local(os.path.join("voice-private", "reference-new.wav"))
    txt = os.environ.get("VOICE_REF_TXT") or _find_local(os.path.join("voice-private", "reference-new.txt"))
    return wav, txt

def voice_json_path():
    """NARRATE_VOICE_JSON, else narration/voice.json found upward from cwd (a repo's committed voice id)."""
    p = os.environ.get("NARRATE_VOICE_JSON")
    if p:
        return p if os.path.exists(p) else None
    return _find_local(os.path.join("narration", "voice.json"))

_REF_SHA = None
_REF_SHA_SRC = None
def ref_sha():
    """sha256 of the reference voice, used only in cache keys. Not a secret.

    Order: VOICE_REF_SHA256 env -> sha256 of the reference wav (local) -> narration/voice.json
    {"refSha256": ...} (CI: no wav, no key). Empty string when none is available."""
    global _REF_SHA, _REF_SHA_SRC
    if _REF_SHA is None:
        env = os.environ.get("VOICE_REF_SHA256", "").strip().lower()
        wav, _ = ref_paths()
        if env:
            _REF_SHA, _REF_SHA_SRC = env, "env VOICE_REF_SHA256"
        elif wav and os.path.exists(wav):
            _REF_SHA = hashlib.sha256(open(wav, "rb").read()).hexdigest()
            _REF_SHA_SRC = "reference wav"
        else:
            vj = voice_json_path()
            sha = ""
            if vj:
                try:
                    sha = str(load_json(vj).get("refSha256", "")).strip().lower()
                except (OSError, ValueError):
                    sha = ""
            _REF_SHA, _REF_SHA_SRC = sha, (vj if sha else None)
    return _REF_SHA

def default_audio_dir():
    """NARRATE_AUDIO_DIR, else <workspace>/4-private/voice-private/audio locally, else ./narrate-audio (CI)."""
    if os.environ.get("NARRATE_AUDIO_DIR"):
        return os.environ["NARRATE_AUDIO_DIR"]
    v = _find_local("voice-private")
    return os.path.join(v, "audio") if v and os.path.isdir(v) else os.path.abspath("narrate-audio")

def legacy_cache_dir():
    d = os.environ.get("NARRATE_LEGACY_CACHE")
    if d:
        return d if os.path.isdir(d) else None
    return _find_local(os.path.join("voice", "cache"))


# ---------------------------------------------------------------- io helpers

def load_json(p):
    with open(p, encoding="utf8") as f:
        return json.load(f)

def _finite(obj):
    """JSON has no Infinity/NaN (MAX_GAP is inf): write them as null so every reader can parse the file."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if isinstance(obj, dict):
        return {k: _finite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_finite(v) for v in obj]
    return obj

def save_json(p, obj):
    os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
    with open(p, "w", encoding="utf8", newline="\n") as f:
        json.dump(_finite(obj), f, indent=1, ensure_ascii=False, allow_nan=False)
        f.write("\n")

def probe_dur(p):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).strip())

AUDIO_EXTS = (".mp3", ".wav")   # cache lookup order: mp3 preferred, wav still read
MP3_BITRATE = os.environ.get("NARRATE_MP3_BITRATE", "192k")

def to_mp3(src, dst):
    """Encode src (any ffmpeg-readable audio) to dst .mp3: libmp3lame CBR MP3_BITRATE, same sample
    rate and channel count as the source (ffmpeg keeps both when not told otherwise). Written via a
    temp file and checked (decodes, duration within 0.05 s of the source) before it replaces dst."""
    tmp = dst + ".part.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-map", "0:a:0", "-c:a", "libmp3lame",
                    "-b:a", MP3_BITRATE, "-map_metadata", "-1", tmp], check=True)
    d_src, d_new = probe_dur(src), probe_dur(tmp)
    if abs(d_src - d_new) > 0.05:
        os.remove(tmp)
        raise RuntimeError(f"mp3 encode of {src}: duration {d_new:.3f}s vs {d_src:.3f}s")
    subprocess.run(["ffmpeg", "-v", "error", "-i", tmp, "-f", "null", "-"], check=True)  # decodes
    os.replace(tmp, dst)
    return dst

def words(text):
    return len(re.findall(r"[A-Za-z0-9']+", text))

def load_timeline(p):
    """v1 {clip, marks} or v2 {schema:2, clip, marks, checkpoints, keyframes, durationS}. Only marks are used."""
    tl = load_json(p)
    marks = sorted(({"t": float(m["t"]), "label": m["label"]} for m in tl.get("marks", [])), key=lambda m: m["t"])
    return tl, marks

FOLLOW_GAP = 0.35  # seconds of breath between a '+' line and the line before it

def line_starts(segs, marks, durs):
    """Slot start per line. 'at': '+' = the line follows the previous one in the same segment
    (starts FOLLOW_GAP after the previous line's voice ends); anything else is a mark (see resolve)."""
    out = []
    for i, s in enumerate(segs):
        if s["at"] == "+":
            if not out:
                raise KeyError("first line can't be '+' (it has no previous line)")
            out.append(out[-1] + durs[i - 1] + FOLLOW_GAP)
        else:
            out.append(resolve(marks, s["at"]))
    return out

def resolve(marks, key):
    """'label' -> first mark with that label, 'label#n' -> nth (1-based)."""
    label, _, n = key.partition("#")
    n = int(n or 1)
    hits = [m["t"] for m in marks if m["label"] == label]
    if len(hits) < n:
        raise KeyError(f"mark '{key}' not in timeline (labels: {sorted(set(m['label'] for m in marks))})")
    return hits[n - 1]

def find_clip(clip_name, timeline_p):
    d = os.path.dirname(os.path.abspath(timeline_p))
    cands = [os.path.join(d, clip_name + ".webm")]
    roots = [os.environ["NARRATE_ROOT"]] if os.environ.get("NARRATE_ROOT") else _workspace_candidates()[:4]
    for r in roots:
        cands += glob.glob(os.path.join(r, "*", "autorecorder", "videos", clip_name + ".webm"))
        cands += glob.glob(os.path.join(r, "autorecorder", "videos", clip_name + ".webm"))
    return next((c for c in cands if os.path.exists(c)), None)


# ---------------------------------------------------------------- cache

def cache_key(text):
    return hashlib.sha256((text + "\0" + MODEL + "\0" + ref_sha()).encode("utf8")).hexdigest()[:32]

def legacy_key(text):
    # voice/narrate.py: sha1(text)[:16].wav (model s2.1-pro-free, reference-20s.wav were fixed there)
    return hashlib.sha1(text.encode()).hexdigest()[:16]

def cached_audio(text, audio_dir, meta=None, import_legacy=True, copy=True):
    """Return (path, source) where source is 'cache' | 'legacy' | None.
    Legacy hits are imported once (encoded to <key>.mp3); copy=False just returns the legacy path."""
    if not ref_sha():
        return None, None
    k = cache_key(text)
    for ext in AUDIO_EXTS:
        p = os.path.join(audio_dir, k + ext)
        if os.path.exists(p):
            return p, "cache"
    if import_legacy and MODEL == "s2.1-pro-free":
        ld = legacy_cache_dir()
        if ld:
            old = os.path.join(ld, legacy_key(text) + ".wav")
            if os.path.exists(old):
                if not copy:
                    return old, "legacy"
                os.makedirs(audio_dir, exist_ok=True)
                p = to_mp3(old, os.path.join(audio_dir, k + ".mp3"))
                write_meta(audio_dir, k, text, p, meta, imported_from=os.path.basename(old))
                return p, "legacy"
    return None, None

def write_meta(audio_dir, k, text, path, meta=None, **extra):
    m = {"text": text, "model": MODEL, "refSha256": ref_sha(), "duration": round(probe_dur(path), 3),
         "file": os.path.basename(path)}
    m.update(meta or {}); m.update(extra)
    save_json(os.path.join(audio_dir, k + ".json"), m)

def fish_tts(text, out_path):
    import requests, ormsgpack  # only needed when generating
    wav, txt = ref_paths()
    if not (wav and os.path.exists(wav) and txt and os.path.exists(txt)):
        sys.exit("error: reference voice missing (set VOICE_REF_WAV and VOICE_REF_TXT)")
    body = ormsgpack.packb({"text": text,
                            "references": [{"audio": open(wav, "rb").read(),
                                            "text": open(txt, encoding="utf8").read().strip()}],
                            "format": "wav", "normalize": True, "latency": "normal"})
    headers = {"Authorization": f"Bearer {fish_key()}", "Content-Type": "application/msgpack", "model": MODEL}
    for attempt in range(6):
        r = requests.post(FISH_URL, data=body, headers=headers, timeout=300)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 ** attempt); continue
        if not r.ok:  # never echo headers (they hold the key)
            raise RuntimeError(f"Fish Audio HTTP {r.status_code}: {r.text[:200]}")
        tmp = out_path + ".part"
        with open(tmp, "wb") as f:
            f.write(r.content)
        os.replace(tmp, out_path)
        return
    raise RuntimeError("Fish Audio kept rate-limiting / failing")


# ---------------------------------------------------------------- fit

def compute_fit(script_p, timeline_p, audio_dir, clip_p=None, max_overlap=MAX_OVERLAP, max_gap=MAX_GAP):
    script = load_json(script_p)
    tl, marks = load_timeline(timeline_p)
    clip = script.get("clip") or tl.get("clip")
    total, total_src = tl.get("durationS"), "timeline"
    if total is None:
        clip_p = clip_p or find_clip(clip, timeline_p)
        if clip_p:
            total, total_src = probe_dur(clip_p), "clip"
    segs = script["segments"]
    durs, hows = [], []
    for seg in segs:
        path, src = cached_audio(seg["text"], audio_dir, copy=False)  # fit never writes audio
        if path:
            durs.append(probe_dur(path)); hows.append("legacy" if src == "legacy" else "audio")
        else:
            durs.append(words(seg["text"]) / WPS); hows.append("estimate")
    starts = line_starts(segs, marks, durs)
    rows = []
    for i, (seg, t) in enumerate(zip(segs, starts)):
        d, how = durs[i], hows[i]
        end = starts[i + 1] if i + 1 < len(starts) else total
        if end is None:  # unknown clip length: assume the last line just fits
            end, how = t + LEAD + d, how + "+noend"
        voice_end = t + LEAD + d
        overlap = max(0.0, voice_end - end)
        gap = max(0.0, end - voice_end)
        rows.append({"i": i, "at": seg["at"], "slotStart": round(t, 2), "slotEnd": round(end, 2),
                     "slot": round(end - t, 2), "duration": round(d, 2), "durationSource": how,
                     "words": words(seg["text"]), "targetWords": max(3, int((end - t - LEAD - 1.0) * WPS)),
                     "overlap": round(overlap, 2), "gap": round(gap, 2),
                     "flag": ("past-end" if total is not None and t >= total else
                              "overlap" if overlap > max_overlap else ("gap" if gap > max_gap else None))})
    ok = not any(r["flag"] for r in rows)
    return {"clip": clip, "script": os.path.abspath(script_p), "timeline": os.path.abspath(timeline_p),
            "clipDuration": total, "clipDurationSource": total_src if total is not None else None,
            "lead": LEAD, "wps": WPS, "maxOverlap": max_overlap, "maxGap": max_gap, "ok": ok, "lines": rows}

def print_fit(fit):
    print(f"\n{fit['clip']}  (clip {fit['clipDuration'] or '?'}s, ok={fit['ok']})")
    print(f"  {'#':>2} {'at':<16} {'slot':>13} {'len':>6} {'tts':>6} {'src':<9} {'over':>5} {'gap':>5}")
    for r in fit["lines"]:
        print(f"  {r['i']:>2} {r['at']:<16} {r['slotStart']:6.1f}-{r['slotEnd']:<6.1f} {r['slot']:6.1f} "
              f"{r['duration']:6.1f} {r['durationSource']:<9} {r['overlap']:5.1f} {r['gap']:5.1f}"
              f"{'  <-- ' + r['flag'].upper() if r['flag'] else ''}")

def cmd_fit(a):
    fit = compute_fit(a.script, a.timeline, a.audio_dir, a.clip, a.max_overlap, a.max_gap)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.script)), f"{fit['clip']}.fit.json")
    save_json(out, fit)
    print_fit(fit)
    print(f"wrote {out}")
    return 0 if fit["ok"] else 1


# ---------------------------------------------------------------- tts

def cmd_tts(a):
    script = load_json(a.script)
    if not ref_sha():
        sys.exit("error: reference voice missing (VOICE_REF_WAV) - needed for cache keys")
    wav, txt = ref_paths()
    if not (wav and os.path.exists(wav) and txt and os.path.exists(txt)) and any(
            not cached_audio(s["text"], a.audio_dir, copy=False)[0] for s in script["segments"]):
        sys.exit("error: lines are missing from the cache and the reference wav is not here: "
                 "tts runs locally only (VOICE.md section 1)")
    os.makedirs(a.audio_dir, exist_ok=True)
    made = reused = 0
    for seg in script["segments"]:
        meta = {"clip": script.get("clip"), "at": seg["at"]}
        p, src = cached_audio(seg["text"], a.audio_dir, meta)
        if p:
            reused += 1; continue
        k = cache_key(seg["text"])
        p = os.path.join(a.audio_dir, k + ".mp3")
        wav_tmp = os.path.join(a.audio_dir, k + ".tts.wav")
        print(f"tts {seg['at']}: {seg['text'][:60]}...")
        fish_tts(seg["text"], wav_tmp)  # Fish returns wav; the cache keeps mp3
        try:
            to_mp3(wav_tmp, p)
        finally:
            if os.path.exists(wav_tmp):
                os.remove(wav_tmp)
        write_meta(a.audio_dir, k, seg["text"], p, meta)
        made += 1
    print(f"tts: {made} generated, {reused} reused ({a.audio_dir})")
    return 0


# ---------------------------------------------------------------- mix

def input_events(timeline_p):
    """[(t, 'click'|'key'|'backspace'|'enter')] from the clip's events.jsonl (recorder `input` events)."""
    ev = timeline_p[: -len(".timeline.json")] + ".events.jsonl" if timeline_p.endswith(".timeline.json") else None
    out = []
    if ev and os.path.exists(ev):
        for line in open(ev, encoding="utf8"):
            try:
                e = json.loads(line)
            except ValueError:
                continue
            # Mouse clicks only: the owner dropped keyboard sounds (2026-11-08); key events stay in the log.
            if e.get("kind") == "input" and e.get("input") == "click":
                out.append((float(e["t"]), e["input"]))
    return out

def make_foley(events, total, out_wav, seed=11):
    """Mouse clicks, one per input event: the recorded sounds/click.wav (synth fallback). Mono 48 kHz."""
    import numpy as np, wave
    sr = 48000
    rng = np.random.default_rng(seed)
    buf = np.zeros(int((total + 1) * sr), dtype=np.float32)

    def burst(ms, tau_ms, amp, tone_hz=0.0, smooth=0.0):
        n = int(sr * ms / 1000)
        t = np.arange(n) / sr
        x = rng.standard_normal(n).astype(np.float32)
        if smooth:  # one-pole low-pass: duller, plasticky key
            for i in range(1, n):
                x[i] = x[i] * (1 - smooth) + x[i - 1] * smooth
        if tone_hz:
            x = x * 0.6 + np.sin(2 * np.pi * tone_hz * t).astype(np.float32) * 0.8
        return (x * np.exp(-t / (tau_ms / 1000)) * amp).astype(np.float32)

    def switch(amp, snap_hz, body_hz):
        """One micro-switch event: a ~0.3 ms snap, a few-kHz ring of the metal leaf (~5 ms),
        and a duller knock of the plastic shell (~10 ms)."""
        n = int(sr * 0.03)
        t = np.arange(n) / sr
        snap = rng.standard_normal(n).astype(np.float32) * np.exp(-t / 0.00025)
        ring = (np.sin(2 * np.pi * snap_hz * t) + 0.5 * np.sin(2 * np.pi * snap_hz * 1.63 * t)) * np.exp(-t / 0.0045)
        knock = np.sin(2 * np.pi * body_hz * t) * np.exp(-t / 0.009)
        return ((0.9 * snap + 0.45 * ring + 0.35 * knock) * amp).astype(np.float32)

    # Real recorded click (owner's pick, 2026-11-08): sounds/click.wav = press + release, onset at
    # ~4 ms. Each click gets a little random level and pitch so repeats don't sound identical.
    sample = None
    sp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sounds", "click.wav")
    if os.path.exists(sp):
        with wave.open(sp, "rb") as w:
            sample = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
        sample *= 0.35 / max(1e-6, np.abs(sample).max())

    for t, kind in events:
        if kind == "click" and sample is not None:
            rate = rng.uniform(0.96, 1.04)  # +-4% pitch/speed
            idx = np.arange(0, len(sample) - 1, rate)
            s = np.interp(idx, np.arange(len(sample)), sample).astype(np.float32) * rng.uniform(0.8, 1.05)
            parts = [(-0.004, s)]
        elif kind == "click":  # fallback synth: press, then a softer, slightly higher release 80-120 ms later
            snap = rng.uniform(3600, 4600); body = rng.uniform(900, 1300); amp = rng.uniform(0.30, 0.38)
            parts = [(0.0, switch(amp, snap, body)),
                     (rng.uniform(0.08, 0.12), switch(amp * 0.6, snap * 1.08, body * 1.1))]
        else:
            parts = [(0.0, burst(24, rng.uniform(3.0, 4.5), rng.uniform(0.10, 0.17), 0, rng.uniform(0.35, 0.6)))]
        for dt, s in parts:
            i = int((t + dt) * sr)
            i = max(0, i)
            if 0 <= i < len(buf):
                j = min(len(buf), i + len(s))
                buf[i:j] += s[: j - i]
    pcm = (np.clip(buf, -1, 1) * 32767).astype("<i2")
    with wave.open(out_wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return out_wav

def cmd_mix(a):
    script = load_json(a.script)
    _, marks = load_timeline(a.timeline)
    total = probe_dur(a.clip)
    paths = []
    for seg in script["segments"]:
        p, _ = cached_audio(seg["text"], a.audio_dir, {"clip": script.get("clip"), "at": seg["at"]})
        if not p:
            sys.exit(f"error: no audio for line '{seg['at']}' - run `tts` first")
        paths.append(p)
    starts = line_starts(script["segments"], marks, [probe_dur(p) for p in paths])
    placed = [(p, t + LEAD) for p, t in zip(paths, starts)]
    inputs, filters = [], []
    natural = getattr(a, "natural", False)
    for k, (audio, start) in enumerate(placed):
        inputs += ["-i", audio]
        ms = int(start * 1000)
        # --natural: each line a touch faster or slower (deterministic per text, +-3%), like a
        # person who doesn't speak every sentence at the same pace.
        tempo = ""
        if natural:
            h = int(hashlib.sha256(script["segments"][k]["text"].encode("utf8")).hexdigest()[:8], 16)
            tempo = f",atempo={0.97 + (h % 61) / 1000:.3f}"
        filters.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=mono{tempo},adelay={ms}|{ms}[v{k}]")
    n = len(placed)
    # Room tone: brown noise + faint 110 Hz hum at one fixed level, no fades/ducking (VOICE.md section 3).
    filters.append(f"anoisesrc=color=brown:amplitude=0.07:duration={total:.2f}:sample_rate=48000:seed=7,"
                   f"highpass=f=60,lowpass=f=1000,volume=0.9[fan]")
    filters.append(f"sine=frequency=110:duration={total:.2f}:sample_rate=48000,volume=0.012[hum]")
    filters.append("".join(f"[v{k}]" for k in range(n)) + f"amix=inputs={n}:normalize=0[voice]")
    # --natural: put the voice in the same room as the room tone: headset/laptop-mic band
    # (cut lows and the airy top), a little presence, light compression, a small-room echo.
    room = ("highpass=f=95,lowpass=f=8000,equalizer=f=2800:t=q:w=1.2:g=2,"
            "acompressor=threshold=-22dB:ratio=3:attack=8:release=150,"
            "aecho=0.85:0.55:19|31:0.14|0.08,") if natural else ""
    filters.append(f"[voice]{room}loudnorm=I=-16:TP=-1.5[vn]")
    # Click sounds are off (owner, 2026-11-09: no mouse-click sound); voice + room tone only.
    # --foley turns them back on for a one-off.
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    ev = input_events(a.timeline) if getattr(a, "foley", False) else []
    extra, foley_wav = [], None
    if ev:
        foley_wav = os.path.abspath(a.out) + ".foley.wav"
        make_foley(ev, total, foley_wav)
        extra = ["-i", foley_wav]
        filters.append(f"[{n + 1}:a]aformat=sample_rates=48000:channel_layouts=mono,volume=0.8[fx]")
        filters.append("[vn][fan][hum][fx]amix=inputs=4:normalize=0,aresample=48000,"
                       "aformat=sample_rates=48000:channel_layouts=stereo[aout]")
    else:
        filters.append("[vn][fan][hum]amix=inputs=3:normalize=0,aresample=48000,"
                       "aformat=sample_rates=48000:channel_layouts=stereo[aout]")
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-i", a.clip, *extra, "-filter_complex", ";".join(filters),
           "-map", f"{n}:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-t", f"{total:.2f}", a.out]
    try:
        subprocess.run(cmd, check=True)
    finally:
        if foley_wav and os.path.exists(foley_wav):
            os.remove(foley_wav)
    print(f"wrote {a.out} ({probe_dur(a.out):.2f}s, {n} lines, {len(ev)} click/key sounds)")
    return 0


# ---------------------------------------------------------------- rewrite

def find_voice_rules():
    p = os.environ.get("NARRATE_VOICE_RULES") or _find_local(os.path.join("instructions", "VOICE.md"))
    return open(p, encoding="utf8").read() if p else ""

def run_claude(prompt, model):
    exe = shutil.which("claude")
    if not exe:
        return None, "claude CLI not found on PATH (npm i -g @anthropic-ai/claude-code)"
    cmd = [exe, "-p", "--output-format", "json", "--model", model, "--tools", "",
           "--no-session-persistence"]
    try:  # prompt via stdin: avoids Windows command-line length limits
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf8", timeout=600)
    except (OSError, subprocess.TimeoutExpired) as e:
        return None, f"claude CLI failed: {e}"
    if r.returncode != 0:
        return None, f"claude CLI exit {r.returncode}: {(r.stderr or r.stdout)[-400:]}"
    try:
        env = json.loads(r.stdout)
    except ValueError:
        return None, "claude CLI returned non-JSON output"
    if env.get("is_error"):
        return None, f"claude CLI error: {str(env.get('result'))[:400]}"
    return env.get("result", ""), None

def parse_rewrites(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        raise ValueError("no JSON object in LLM reply")
    data = json.loads(m.group(0))
    return {int(x["i"]): x["text"].strip() for x in data.get("lines", []) if x.get("text", "").strip()}

def word_bounds(r):
    hi = r["targetWords"]
    return max(3, int(hi * 0.75)), hi

def build_prompt(script, fit, rules):
    flagged = [r for r in fit["lines"] if r["flag"] in REWRITABLE]
    ctx = "\n".join(f"[{r['i']}] at={r['at']} slot={r['slot']}s: {script['segments'][r['i']]['text']}"
                    for r in fit["lines"])
    asks = "\n".join(
        f"- i={r['i']} at={r['at']}: slot {r['slot']}s, spoken now {r['duration']}s "
        f"({'overlaps next line by ' + str(r['overlap']) + 's' if r['flag'] == 'overlap' else 'leaves ' + str(r['gap']) + 's of silence'}). "
        f"Current {r['words']} words. New line: {word_bounds(r)[0]} to {word_bounds(r)[1]} words (count them)."
        for r in flagged)
    return f"""You are editing the voice-over script for a screen-recorded docs QA clip.
Follow these narration rules exactly:

<rules>
{rules or '(rules file not found: casual, short sentences, a few umm/uh fillers, no timing-specific lines)'}
</rules>

Whole script for context (clip {fit['clip']}; the voice reads ~{WPS} words per second, and each line starts {LEAD}s after its slot begins):
{ctx}

Rewrite ONLY these lines so each fits its slot:
{asks}

Keep the meaning, facts, page/framework names and the line's role (intro, IDE, demo, evidence, notepad, ending).
For a gap, fill it with natural talk: expand on what the script already says (what is being tested, what happened, the reason),
stated as results, never "now I'm clicking". NEVER invent actions, checks, errors or facts that the script doesn't already state
(no "I reloaded", "I checked the console" unless it's in the script); restating and fillers are fine.
Don't touch other lines. Reply with ONLY a JSON object, no prose:
{{"lines": [{{"i": <index>, "text": "<new line>"}}]}}"""

def rewrite_once(script_p, fit, out_p, model, in_place=False):
    script = load_json(script_p)
    if not any(r["flag"] in REWRITABLE for r in fit["lines"]):
        print("rewrite: nothing to rewrite (past-end marks need a new timeline, not new text)"); return script_p, False
    rows = {r["i"]: r for r in fit["lines"] if r["flag"] in REWRITABLE}
    allowed = set(rows)
    prompt = build_prompt(script, fit, find_voice_rules())
    new, best_err = {}, None
    for attempt in range(3):  # LLMs miscount words: check sizes and send the misses back
        reply, err = run_claude(prompt, model)
        if err:
            print(f"rewrite skipped: {err}", file=sys.stderr); return script_p, False
        try:
            got = parse_rewrites(reply)
        except ValueError as e:
            print(f"rewrite attempt {attempt + 1}: {e}", file=sys.stderr); continue
        got = {i: t for i, t in got.items() if i in allowed}
        misses = []
        for i, t in got.items():
            lo, hi = word_bounds(rows[i])
            if not lo <= words(t) <= hi:
                misses.append(f"- i={i}: your line has {words(t)} words, it must be {lo} to {hi}: {t}")
        err_total = sum(max(0, words(t) - word_bounds(rows[i])[1]) * 3 + max(0, word_bounds(rows[i])[0] - words(t))
                        for i, t in got.items())
        if got and (best_err is None or err_total < best_err):
            new, best_err = got, err_total
        if got and not misses:
            break
        print(f"rewrite attempt {attempt + 1}: {len(misses)} line(s) off size, retrying", file=sys.stderr)
        prompt += ("\n\nYour previous reply had lines of the wrong size:\n" + "\n".join(misses) +
                   "\nFix them and reply again with the full JSON object for all requested lines.")
    if not new:
        print("rewrite skipped: no usable reply", file=sys.stderr); return script_p, False
    old_lines = [f"[{s['at']}] {s['text']}" for s in script["segments"]]
    for i, text in new.items():
        if i in allowed:
            script["segments"][i]["text"] = text
    new_lines = [f"[{s['at']}] {s['text']}" for s in script["segments"]]
    dest = script_p if in_place else out_p
    save_json(dest, script)
    diff = "\n".join(difflib.unified_diff(old_lines, new_lines, os.path.basename(script_p), os.path.basename(dest), lineterm=""))
    with open(dest + ".diff", "w", encoding="utf8", newline="\n") as f:
        f.write(diff + "\n")
    print(diff or "rewrite: LLM returned no changes")
    print(f"wrote {dest} (+ .diff)")
    return dest, bool(diff)

def default_rewrite_out(script_p):
    base, ext = os.path.splitext(script_p)
    return base + ".rewritten" + (ext or ".json")

def cmd_rewrite(a):
    fit = load_json(a.fit)
    out = a.out or default_rewrite_out(a.script)
    _, changed = rewrite_once(a.script, fit, out, a.model, a.in_place)
    return 0 if changed or not any(r["flag"] in REWRITABLE for r in fit["lines"]) else 1


# ---------------------------------------------------------------- all

def cmd_all(a):
    script_p = a.script
    work = a.out_script or (a.script if a.in_place else default_rewrite_out(a.script))
    fit_p = os.path.splitext(a.out)[0] + ".fit.json"
    for rnd in range(3):
        fit = compute_fit(script_p, a.timeline, a.audio_dir, a.clip, a.max_overlap, a.max_gap)
        print_fit(fit)
        if fit["ok"] or rnd == 2 or a.no_rewrite:
            break
        print(f"\n== rewrite round {rnd + 1} ==")
        script_p, changed = rewrite_once(script_p, fit, work, a.model, in_place=(script_p == work))
        if not changed:
            break
    a.script = script_p
    cmd_tts(a)
    fit = compute_fit(script_p, a.timeline, a.audio_dir, a.clip, a.max_overlap, a.max_gap)
    save_json(fit_p, fit)
    print_fit(fit)
    cmd_mix(a)
    if not fit["ok"]:
        print("warning: final fit still has flagged lines (see " + fit_p + ")", file=sys.stderr)
        return 1 if a.strict else 0
    return 0


# ---------------------------------------------------------------- import-cache

def cmd_import(a):
    os.environ["NARRATE_LEGACY_CACHE"] = a.src
    n = hit = 0
    for sp in a.scripts:
        s = load_json(sp)
        for seg in s["segments"]:
            n += 1
            p, src = cached_audio(seg["text"], a.audio_dir, {"clip": s.get("clip"), "at": seg["at"]})
            hit += bool(p)
    print(f"import-cache: {hit}/{n} lines now in {a.audio_dir}")
    return 0


# ---------------------------------------------------------------- voice-id

def cmd_voice_id(a):
    """Print (and with --write, save) the reference sha256 so CI can find cached audio without the wav."""
    sha = ref_sha()
    if not sha:
        sys.exit("error: no reference voice found (VOICE_REF_WAV, VOICE_REF_SHA256 or narration/voice.json)")
    print(f"refSha256 {sha}  (from {_REF_SHA_SRC}; model {MODEL})")
    if a.write:
        save_json(a.write, {"refSha256": sha, "model": MODEL,
                            "note": "sha256 of the private reference voice wav; cache key input only, "
                                    "not a secret. The wav itself is never committed (VOICE.md section 2)."})
        print(f"wrote {a.write}")
    return 0


# ---------------------------------------------------------------- cli

def main(argv=None):
    ap = argparse.ArgumentParser(prog="narrate.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, fitopts=False, clipopt=True):
        p.add_argument("--audio-dir", default=default_audio_dir())
        if fitopts:
            if clipopt:
                p.add_argument("--clip", help="clip .webm (for the last slot's end; auto-found if omitted)")
            p.add_argument("--max-overlap", type=float, default=MAX_OVERLAP)
            p.add_argument("--max-gap", type=float, default=MAX_GAP)
        return p

    p = common(sub.add_parser("fit"), True); p.add_argument("script"); p.add_argument("timeline")
    p.add_argument("--out", help="fit json path (default <script dir>/<clip>.fit.json)"); p.set_defaults(fn=cmd_fit)

    p = common(sub.add_parser("tts")); p.add_argument("script"); p.set_defaults(fn=cmd_tts)

    p = common(sub.add_parser("mix")); p.add_argument("script"); p.add_argument("clip")
    p.add_argument("timeline"); p.add_argument("out")
    p.add_argument("--natural", action="store_true",
                   help="mic EQ, light compression, small-room echo, +-3%% pace per line (less robotic)")
    p.add_argument("--foley", action="store_true",
                   help="add mouse-click sounds at the clip's input events (off by default since 2026-11-09)")
    p.add_argument("--no-foley", action="store_true", help="no-op (clicks are off by default); kept for old callers")
    p.set_defaults(fn=cmd_mix)

    p = sub.add_parser("rewrite"); p.add_argument("script"); p.add_argument("timeline")
    p.add_argument("--fit", required=True); p.add_argument("--out"); p.add_argument("--in-place", action="store_true")
    p.add_argument("--model", default=os.environ.get("NARRATE_LLM_MODEL", "sonnet")); p.set_defaults(fn=cmd_rewrite)

    p = common(sub.add_parser("all"), True, clipopt=False); p.add_argument("script"); p.add_argument("clip")
    p.add_argument("timeline"); p.add_argument("out")
    p.add_argument("--model", default=os.environ.get("NARRATE_LLM_MODEL", "sonnet"))
    p.add_argument("--out-script", help="where rewritten script goes (default <script>.rewritten.json)")
    p.add_argument("--in-place", action="store_true"); p.add_argument("--no-rewrite", action="store_true")
    p.add_argument("--strict", action="store_true", help="exit 1 if the final fit is still flagged")
    p.set_defaults(fn=cmd_all)

    p = common(sub.add_parser("import-cache")); p.add_argument("scripts", nargs="+")
    p.add_argument("--from", dest="src", required=True); p.set_defaults(fn=cmd_import)

    p = sub.add_parser("voice-id"); p.add_argument("--write", metavar="narration/voice.json")
    p.set_defaults(fn=cmd_voice_id)

    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except KeyError as e:  # unresolved mark label: script and timeline don't match
        print(f"error: {e.args[0]}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())
