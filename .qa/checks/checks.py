#!/usr/bin/env python3
"""Free, deterministic checks for one docs-QA clip. No LLM, no secrets, no network.

    python checks.py CLIP.webm [--timeline T] [--events E] [--expect-status ✅|⚠️|❌]
                     [--note "finding text"] --out DIR [--no-frames] [--fail-on-issues]

Checks (rubric: instructions/REVIEW.md):
  - duration (ffprobe), and timeline durationS vs the video
  - ffmpeg blackdetect + freezedetect; freezes judged against per-segment limits
  - timeline marks: in order, inside the video, first mark early, no long unmarked tail
  - required segments for the expected status (❌/⚠️: doc, demo, evidence, notepad; ✅: no notepad
    unless the note is temperature-only)
  - events.jsonl: page errors, console errors, failed requests; failed checkpoints (timeline v2),
    each tagged with the segment it falls in
  - red-pixel scan at 1 fps: runs of saturated red, one frame per run. A run is only reported,
    never judged: red text inside the intentional end-of-clip failure terminal, a CopilotKit error
    card or the Next.js badge is not an overlay. The reviewer decides.

Writes DIR/<clip>.checks.json (+ DIR/<clip>.checks/red-*.jpg). Never touches the clip or its sidecars.
Needs ffmpeg/ffprobe on PATH and numpy.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

VERSION = 1
SCAN_W, SCAN_H = 480, 270    # red-pixel scan resolution
RED_MIN_PX = 40              # red pixels (at scan res) for a second to count as "has red"
FRAME_W = 1280               # saved red-run frames

# Mark label -> segment kind. Unknown labels are "other" (SCHEMA.md: treat unknown labels as opaque).
KIND_OF = {
    "doc": "doc", "doc2": "doc", "doc3": "doc", "page": "doc",
    "ide": "ide", "code": "ide", "vscode": "ide",
    "demo": "demo", "demo2": "demo", "demo3": "demo", "action": "demo", "click": "demo",
    "wait": "demo", "error": "demo", "app": "demo", "reply": "demo", "result": "demo",
    "evidence": "evidence", "highlight": "evidence",
    "notepad": "notepad", "notepad2": "notepad", "notepad3": "notepad", "notepad-open": "notepad",
    "notepad-closed": "outro", "end": "outro",
    "console": "terminal", "terminal": "terminal",
    "failure": "failure",   # the intentional end-of-clip terminal on a failed take
}
# Longest plausible unchanged screen per segment kind (seconds).
FREEZE_LIMIT = {"demo": 90, "ide": 40, "evidence": 25, "notepad": 25, "doc": 25, "outro": 30,
                "terminal": 30, "failure": 40, "window": 60, "other": 40}
# Kind priority when short segments are merged: the merged segment takes the most important kind.
KIND_ORDER = ["notepad", "evidence", "demo", "failure", "ide", "terminal", "doc", "outro", "other"]


def kind_of(label: str) -> str:
    return KIND_OF.get(label.split("#")[0], "other")


def fmt_t(t: float) -> str:
    return f"{int(t // 60)}:{t % 60:04.1f}"


def norm_status(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip().replace("️", "")
    return {"⚠": "⚠️", "ok": "✅", "pass": "✅", "warn": "⚠️", "fail": "❌", "✅": "✅", "❌": "❌"}.get(s.lower(), s)


# --------------------------------------------------------------------------------------- inputs

def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "csv=p=0", str(path)], text=True).strip()
    try:
        return float(out)
    except ValueError:  # Playwright webm sometimes has no container duration: count packets
        out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
                                       "-show_entries", "packet=pts_time", "-of", "csv=p=0",
                                       str(path)], text=True)
        ts = [float(x) for x in out.split() if x.strip() and x.strip() != "N/A"]
        return max(ts) if ts else 0.0


def load_json(path: Path | None):
    return json.loads(Path(path).read_text(encoding="utf-8")) if path else None


def load_events(path: Path | None) -> list[dict]:
    out: list[dict] = []
    if not path:
        return out
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def sibling(clip: Path, suffix: str) -> Path | None:
    p = clip.with_name(clip.stem + suffix)
    return p if p.exists() else None


# --------------------------------------------------------------------------------------- segments

def build_segments(marks: list[dict], duration: float, window: float = 24.0) -> list[dict]:
    """Segments between consecutive marks; ones shorter than 3 s are merged into the next.
    Without a timeline: fixed 24 s windows (kind "window")."""
    if not marks:
        segs, t, i = [], 0.0, 1
        while t < duration - 0.5:
            end = min(duration, t + window)
            segs.append({"label": f"window-{i}", "kind": "window", "start": round(t, 2),
                         "end": round(end, 2), "labels": []})
            t, i = end, i + 1
        return segs
    ms = sorted(marks, key=lambda m: float(m["t"]))
    raw = []
    for i, m in enumerate(ms):
        if m["label"] == "end":
            continue
        end = min(float(ms[i + 1]["t"]) if i + 1 < len(ms) else duration, duration)
        if end - float(m["t"]) <= 0.05:
            continue
        raw.append({"label": m["label"], "start": float(m["t"]), "end": end, "detail": m.get("detail")})
    seen: dict[str, int] = {}
    for s in raw:  # number repeats the way narration does: evidence, evidence#2 ...
        seen[s["label"]] = seen.get(s["label"], 0) + 1
        s["key"] = s["label"] if seen[s["label"]] == 1 else f"{s['label']}#{seen[s['label']]}"
    merged, carry = [], None
    for s in raw:
        if carry:
            s = {**s, "start": carry["start"], "labels": carry["labels"] + [s["key"]],
                 "details": carry["details"] + ([s["detail"]] if s.get("detail") else [])}
            carry = None
        else:
            s = {**s, "labels": [s["key"]], "details": [s["detail"]] if s.get("detail") else []}
        if s["end"] - s["start"] < 3.0 and s is not raw[-1]:
            carry = s
            continue
        merged.append(s)
    if carry:
        if merged:
            merged[-1]["end"] = carry["end"]
            merged[-1]["labels"] += carry["labels"]
        else:
            merged.append(carry)
    out = []
    for s in merged:
        kind = sorted((kind_of(l) for l in s["labels"]), key=KIND_ORDER.index)[0]
        out.append({"label": "+".join(s["labels"]), "kind": kind, "start": round(s["start"], 2),
                    "end": round(s["end"], 2), "labels": s["labels"], "details": s.get("details", [])})
    return out


def seg_at(segs: list[dict], t: float | None) -> dict | None:
    if t is None or not segs:
        return None
    for s in segs:
        if s["start"] <= t < s["end"]:
            return s
    return segs[-1] if t >= segs[-1]["end"] else segs[0]


# --------------------------------------------------------------------------------------- ffmpeg

def black_freeze(clip: Path) -> tuple[list[dict], list[dict]]:
    """One low-res decode: blackdetect (>= 1 s) + freezedetect (>= 8 s)."""
    vf = "scale=480:-2,blackdetect=d=1.0:pix_th=0.10,freezedetect=n=-50dB:d=8"
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(clip), "-an", "-vf", vf,
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    err = p.stderr
    blacks = [{"start": float(a), "end": float(b), "dur": float(c)} for a, b, c in
              re.findall(r"black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)", err)]
    freezes, cur = [], None
    for line in err.splitlines():
        m = re.search(r"freeze_start: ([\d.]+)", line)
        if m:
            cur = {"start": float(m.group(1))}
        m = re.search(r"freeze_end: ([\d.]+)", line)
        if m and cur is not None:
            cur["end"] = float(m.group(1))
            freezes.append(cur)
            cur = None
    if cur is not None:  # frozen until the end
        cur["end"] = None
        freezes.append(cur)
    return blacks, freezes


def red_scan(clip: Path) -> list[dict]:
    """1 fps scan for saturated red (R > 170, G < 90, B < 90) at 480x270, taskbar strip ignored.

    A run = consecutive seconds with red, split where the red pixel count jumps (new content).
    Each run: start/end second (end inclusive, so it lasts end+1-start s), peak px, bounding box
    (at 480x270) and a representative time `t` (the middle)."""
    import numpy as np
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(clip), "-vf",
                             f"fps=1,scale={SCAN_W}:{SCAN_H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                            stdout=subprocess.PIPE)
    n = SCAN_W * SCAN_H * 3
    counts, boxes = [], []
    while True:
        b = proc.stdout.read(n)
        if len(b) < n:
            break
        a = np.frombuffer(b, np.uint8).reshape(SCAN_H, SCAN_W, 3).astype(np.int16)
        m = (a[..., 0] > 170) & (a[..., 1] < 90) & (a[..., 2] < 90)
        m[SCAN_H - 12:, :] = False          # Windows taskbar strip (red tray icons)
        c = int(m.sum())
        counts.append(c)
        if c:
            ys, xs = np.nonzero(m)
            boxes.append([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())])
        else:
            boxes.append(None)
    proc.wait()
    runs, cur = [], None
    for t, c in enumerate(counts):
        if c >= RED_MIN_PX:
            if cur and t == cur["end"] + 1 and abs(c - cur["last"]) <= max(25, 0.25 * cur["last"]):
                cur["end"], cur["last"], cur["peak"] = t, c, max(cur["peak"], c)
                b = boxes[t]
                cur["box"] = [min(cur["box"][0], b[0]), min(cur["box"][1], b[1]),
                              max(cur["box"][2], b[2]), max(cur["box"][3], b[3])]
                continue
            cur = {"start": t, "end": t, "last": c, "peak": c, "box": list(boxes[t])}
            runs.append(cur)
        else:
            cur = None
    for r in runs:
        r["t"] = round((r["start"] + r["end"]) / 2 + 0.5, 1)
        r["dur"] = r["end"] + 1 - r["start"]
        r.pop("last")
    return runs


def extract_frame(clip: Path, t: float, dest: Path) -> bool:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, t):.2f}", "-i", str(clip),
                    "-frames:v", "1", "-vf", f"scale={FRAME_W}:-2", "-q:v", "3", str(dest)], check=False)
    return dest.exists()


# --------------------------------------------------------------------------------------- checks

def run_checks(clip: Path, out: Path, timeline: Path | None = None, events: Path | None = None,
               expect_status: str | None = None, note: str | None = None, frames: bool = True) -> dict:
    t0 = time.time()
    clip, out = Path(clip).resolve(), Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    name = clip.stem
    timeline = Path(timeline) if timeline else sibling(clip, ".timeline.json")
    events = Path(events) if events else sibling(clip, ".events.jsonl")
    tl = load_json(timeline)
    ev = load_events(events)
    expect_status = norm_status(expect_status)
    duration = ffprobe_duration(clip)

    issues: list[str] = []          # recording problems: likely a rerecord
    status_signals: list[str] = []  # evidence against the expected status: a human/Haiku re-checks
    look_at: list[str] = []         # things to look at, not judged here (red runs)
    warnings: list[str] = []

    if duration < 15:
        issues.append(f"clip is very short ({duration:.1f}s)")
    if duration > 600:
        issues.append(f"clip is very long ({duration:.1f}s)")

    # ---- marks
    marks = list((tl or {}).get("marks", []))
    mk = {"has_timeline": bool(tl), "schema": (tl or {}).get("schema", 1 if tl else None),
          "count": len(marks), "labels": [m["label"] for m in marks]}
    if tl:
        ts = [float(m["t"]) for m in marks]
        mk["in_order"] = ts == sorted(ts)
        if not mk["in_order"]:
            issues.append("timeline marks are not in time order")
        outside = [m for m in marks if float(m["t"]) < 0 or float(m["t"]) > duration + 0.5]
        mk["outside"] = [{"label": m["label"], "t": m["t"]} for m in outside]
        if outside:
            issues.append("marks outside the video: " + ", ".join(f"{m['label']}@{m['t']}" for m in outside))
        if ts and min(ts) > 3:
            issues.append(f"first mark starts late ({min(ts)}s)")
        dS = tl.get("durationS")
        mk["durationS"] = dS
        if dS and abs(float(dS) - duration) > 3:
            issues.append(f"timeline durationS {dS}s vs video {duration:.1f}s (clip cut or stale timeline)")
        last = max(ts) if ts else 0
        if last < duration - 45 and not any(m["label"] in ("end", "notepad-closed") for m in marks):
            issues.append(f"last mark at {last}s, video runs to {duration:.1f}s (unmarked tail)")
        if not marks:
            issues.append("timeline has no marks")
    else:
        warnings.append("no timeline: segments are 24 s windows, segment checks skipped")

    # ---- required segments
    kinds = {kind_of(m["label"]) for m in marks}
    temp_only = bool(note and re.search(r"temperature|temp issue", note, re.I))
    required = {"doc", "demo"}
    if expect_status in ("❌", "⚠️"):
        required |= {"evidence", "notepad"}
    missing = sorted(k for k in required if k not in kinds) if tl else []
    if missing:
        issues.append("required segments missing for status %s: %s" % (expect_status or "?", ", ".join(missing)))
    if tl and "ide" not in kinds:
        warnings.append("no ide segment")
    if expect_status == "✅" and "notepad" in kinds and not temp_only:
        issues.append("✅ clip has a Notepad segment (working clips have none, except temperature-only)")
    if "failure" in kinds:
        f = next(m for m in marks if m["label"] == "failure")
        msg = f"take failed at {f['t']}s (recorder verdict: {str(f.get('detail', ''))[:160]})"
        (status_signals if expect_status == "✅" else warnings).append(msg)
    seg_req = {"required": sorted(required), "missing": missing, "kinds_present": sorted(kinds),
               "temperature_only_note": temp_only}

    segs = build_segments(marks, duration)

    def tag(t):
        s = seg_at(segs, float(t)) if t is not None else None
        return (s["label"], s["kind"]) if s else (None, None)

    # ---- events
    def ev_rec(e, keys):
        lbl, knd = tag(e.get("t"))
        r = {"t": e.get("t"), "segment": lbl, "kind": knd}
        for k in keys:
            v = e.get(k)
            r[k] = v[:300] if isinstance(v, str) else v
        return r

    page_errors = [ev_rec(e, ["message"]) for e in ev if e.get("kind") == "pageerror"]
    console_errors = [ev_rec(e, ["text", "source"]) for e in ev
                      if e.get("kind") == "console" and e.get("level") in ("error", "assert")]
    failed_requests = [ev_rec(e, ["method", "status", "url", "error"]) for e in ev if e.get("kind") == "network"]
    failed_actions = [ev_rec(e, ["action", "target", "error"]) for e in ev
                      if e.get("kind") == "action" and e.get("result") == "error"]
    cps = list((tl or {}).get("checkpoints", []))
    cp_failed = [{**{k: c.get(k) for k in ("t", "label", "expect", "observed", "ok")},
                  "segment": tag(c.get("t"))[0]} for c in cps if not c.get("ok")]
    in_demo = lambda xs: [x for x in xs if x["kind"] in ("demo", "failure")]
    evs = {"has_events": bool(events), "count": len(ev),
           "page_errors": page_errors[:40], "console_errors": console_errors[:60],
           "failed_requests": failed_requests[:60], "failed_actions": failed_actions[:30],
           "checkpoints_total": len(cps), "checkpoints_failed": cp_failed,
           "demo_counts": {"page_errors": len(in_demo(page_errors)), "console_errors": len(in_demo(console_errors)),
                           "failed_requests": len(in_demo(failed_requests))},
           "totals": {"page_errors": len(page_errors), "console_errors": len(console_errors),
                      "failed_requests": len(failed_requests), "failed_actions": len(failed_actions)}}
    if expect_status == "✅" and (in_demo(page_errors) or cp_failed):
        status_signals.append(f"✅ expected but {len(in_demo(page_errors))} page error(s) in the demo and "
                              f"{len(cp_failed)} failed checkpoint(s) were logged")
    if expect_status in ("❌", "⚠️") and cps and not cp_failed and not in_demo(page_errors) and "failure" not in kinds:
        status_signals.append(f"{expect_status} expected but every checkpoint passed and no demo page error "
                              "was logged (known failure may now work: look at the demo)")
    if failed_actions:
        warnings.append(f"{len(failed_actions)} recorder action(s) failed (first: "
                        f"{failed_actions[0].get('action')} {str(failed_actions[0].get('target'))[:80]})")

    # ---- black / freeze
    blacks, freezes = black_freeze(clip)
    bad_black = [b for b in blacks if not (b["start"] < 1.0 and b["dur"] < 2.5)
                 and not (b["end"] > duration - 1.0 and b["dur"] < 2.5)]
    for b in blacks:
        b["ok"] = b not in bad_black
    if bad_black:
        issues.append("black stretches: " + ", ".join(f"{fmt_t(b['start'])} ({b['dur']:.1f}s)" for b in bad_black))
    fz_out = []
    for f in freezes:
        end = f["end"] if f["end"] is not None else duration
        dur = end - f["start"]
        s = seg_at(segs, f["start"] + min(2.0, dur / 2))
        kind = s["kind"] if s else "window"
        limit = FREEZE_LIMIT.get(kind, 40)
        rec = {"start": round(f["start"], 2), "end": round(end, 2), "dur": round(dur, 1),
               "segment": s["label"] if s else None, "kind": kind, "limit": limit,
               "to_end": f["end"] is None, "ok": dur <= limit}
        fz_out.append(rec)
        if dur > limit:
            issues.append(f"frozen {dur:.0f}s at {fmt_t(f['start'])} in '{rec['segment']}' ({kind}, limit {limit}s)")
    if freezes and freezes[-1]["end"] is None and duration - freezes[-1]["start"] > 30:
        issues.append(f"video frozen from {fmt_t(freezes[-1]['start'])} to the end")

    # ---- red scan
    runs = red_scan(clip)
    fdir = out / f"{name}.checks"
    for r in runs:
        lbl, knd = tag(r["t"])
        r["segment"], r["kind"] = lbl, knd
        x0, y0, x1, y1 = r["box"]
        if knd == "failure":
            r["context"] = "inside the end-of-clip failure terminal (intentional; red log text is expected)"
        elif knd == "terminal":
            r["context"] = "terminal segment (red log text is normal)"
        elif x0 <= 20 and x1 <= 60 and y0 >= 235:
            r["context"] = "bottom-left pill: position of the Next.js dev 'N Issue' badge (real app error, allowed)"
            r["likely_nextjs_badge"] = True
        if frames:
            fdir.mkdir(exist_ok=True)
            dest = fdir / f"red-{r['t']:06.1f}s.jpg"
            r["frame"] = f"{fdir.name}/{dest.name}" if extract_frame(clip, r["t"], dest) else None
    outside_term = [r for r in runs if r["kind"] not in ("failure", "terminal") and not r.get("likely_nextjs_badge")]
    if outside_term:
        look_at.append("saturated red at " + ", ".join(f"{r['start']}-{r['end'] + 1}s ({r['segment']})"
                                                       for r in outside_term)
                       + ": injected overlay, or allowed red (app/CopilotKit error card, Next.js badge, "
                         "the intentional end-of-clip failure terminal)? Look at the frames.")

    result = {
        "tool": "qa-kit/checks", "version": VERSION, "clip": name, "video": str(clip),
        "timeline": str(timeline) if timeline else None, "events": str(events) if events else None,
        "expect_status": expect_status, "note": note, "duration": round(duration, 2),
        "ok": not issues, "issues": issues, "status_signals": status_signals, "look_at": look_at,
        "warnings": warnings,
        "marks": mk, "segments_required": seg_req,
        "segments": [{k: s[k] for k in ("label", "kind", "start", "end")} for s in segs],
        "events_summary": evs,
        "black": blacks, "freezes": fz_out, "red_runs": runs,
        "runtime_s": round(time.time() - t0, 1),
    }
    (out / f"{name}.checks.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("clip", type=Path)
    ap.add_argument("--timeline", type=Path, help="default: <clip>.timeline.json beside the video")
    ap.add_argument("--events", type=Path, help="default: <clip>.events.jsonl beside the video")
    ap.add_argument("--expect-status", help="✅ | ⚠️ | ❌")
    ap.add_argument("--note", help="the report's finding note (used for the temperature-only exception)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--no-frames", action="store_true", help="don't save a frame per red run")
    ap.add_argument("--fail-on-issues", action="store_true", help="exit 1 when `issues` is not empty")
    a = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    r = run_checks(a.clip, a.out, a.timeline, a.events, a.expect_status, a.note, not a.no_frames)
    print(json.dumps({"clip": r["clip"], "ok": r["ok"], "issues": r["issues"],
                      "status_signals": r["status_signals"], "look_at": r["look_at"],
                      "red_runs": [f"{x['start']}-{x['end'] + 1}s {x['segment']}" for x in r["red_runs"]],
                      "out": str(Path(a.out) / f"{r['clip']}.checks.json")}, ensure_ascii=False))
    return 1 if (a.fail_on_issues and r["issues"]) else 0


if __name__ == "__main__":
    sys.exit(main())
