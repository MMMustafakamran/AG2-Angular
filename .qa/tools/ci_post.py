#!/usr/bin/env python3
"""Daily CI post-processing (no LLM, no Fish key, no voice sample, no network).

After the recorder ran:
  1. narration: for every narration/scripts/<clip>.json whose page in assignment.json is ❌ or ⚠️
     and whose clip was recorded: `narrate.py fit`, then `mix` with the saved narration/audio.
     A flagged line or a line without saved audio is recorded, never fatal.
  2. checks: `.qa/checks/batch.py` over every recorded clip, expected status from assignment.json.
     Clips a shard already checked (`--checks-only`, uploaded in videos/_shard-checks/) are reused.
  3. summary.md: record results, drift, narration, checks.

  python tools/ci_post.py --videos autorecorder/videos --out out/run [--drift out/run/drift/drift.md] [--versions out/run/versions.md]
Exit 0 unless the script itself breaks.
"""
import argparse
import glob
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

NARRATE_STATUSES = ("❌", "⚠️")
JOBS = max(2, os.cpu_count() or 2)
# Shards run the clip checks next to the recording (--checks-only) and upload them here; the
# report job reuses them instead of decoding every clip again.
SHARD_CHECKS = "_shard-checks"


def load_pages(root):
    """clip name -> {id, label, status} from assignment.json."""
    p = root / "assignment.json"
    out = {}
    if not p.exists():
        return out
    a = json.loads(p.read_text(encoding="utf-8"))
    for page in a.get("pages", []):
        for link in page.get("links") or []:
            if link.get("clip"):
                out[link["clip"]] = {"id": page.get("id"), "label": page.get("label"),
                                     "status": page.get("status")}
    return out


def tail(s, n=6):
    return "\n".join((s or "").strip().splitlines()[-n:])


def run(cmd, env=None):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    return r.returncode, r.stdout, r.stderr


def narrate(root, videos, out, pages, py):
    narr = root / "narration"
    script_dir = narr / "scripts"
    n = root / ".qa" / "narrate" / "narrate.py"
    rows = []
    if not script_dir.is_dir() or not n.exists():
        return rows, f"skipped: {'no narration/scripts' if not script_dir.is_dir() else 'no .qa/narrate/narrate.py'}"
    env = dict(os.environ)
    if (narr / "voice.json").exists():
        env["NARRATE_VOICE_JSON"] = str(narr / "voice.json")
    nout = out / "narration"
    nout.mkdir(parents=True, exist_ok=True)
    todo = []
    for s in sorted(script_dir.glob("*.json")):
        try:
            clip = json.loads(s.read_text(encoding="utf-8"))["clip"]
        except Exception as e:  # noqa: BLE001
            rows.append({"clip": s.stem, "result": f"bad script: {e}"})
            continue
        page = pages.get(clip, {})
        status = page.get("status")
        if status not in NARRATE_STATUSES:
            continue
        row = {"clip": clip, "page": page.get("id"), "status": status, "flags": [], "noAudio": []}
        rows.append(row)
        todo.append((s, clip, row))

    def one(job):
        s, clip, row = job
        webm, tl = videos / f"{clip}.webm", videos / f"{clip}.timeline.json"
        if not webm.exists() or not tl.exists():
            row["result"] = "not recorded" if not webm.exists() else "no timeline"
            return
        fit_p = nout / f"{clip}.fit.json"
        rc, so, se = run([py, str(n), "fit", str(s), str(tl), "--clip", str(webm),
                          "--audio-dir", str(narr / "audio"), "--out", str(fit_p)], env)
        (nout / f"{clip}.fit.txt").write_text(so + se, encoding="utf-8")
        if fit_p.exists():
            fit = json.loads(fit_p.read_text(encoding="utf-8"))
            row["flags"] = [f"{l['at']}:{l['flag']}" for l in fit["lines"] if l.get("flag")]
            row["noAudio"] = [l["at"] for l in fit["lines"] if l.get("durationSource", "").startswith("estimate")]
        elif rc == 2:
            row["flags"] = ["script label missing from timeline"]
        else:
            row["flags"] = [f"fit failed (exit {rc}): {tail(se, 2)}"]
        if row["noAudio"]:
            row["result"] = "raw clip only (lines without saved audio)"
            return
        mp4 = nout / f"{clip}.narrated.mp4"
        rc, so, se = run([py, str(n), "mix", str(s), str(webm), str(tl), str(mp4),
                          "--audio-dir", str(narr / "audio")], env)
        (nout / f"{clip}.mix.txt").write_text(so + se, encoding="utf-8")
        row["result"] = "narrated" if rc == 0 and mp4.exists() else f"mix failed: {tail(se, 2)}"

    # One ffmpeg mix per clip, several at once (each is mostly single-threaded encode work).
    with ThreadPoolExecutor(max_workers=JOBS) as ex:
        list(ex.map(one, todo))
    return rows, None


def checks(root, videos, out, pages, py, reuse=()):
    batch = root / ".qa" / "checks" / "batch.py"
    clips = sorted(glob.glob(str(videos / "*.webm")))
    if not batch.exists():
        return "_skipped: no `.qa/checks/batch.py`_\n"
    if not clips:
        return "_no clips recorded_\n"
    manifest = []
    for c in clips:
        name = Path(c).stem
        item = {"clip": c}
        st = pages.get(name, {}).get("status")
        if st:
            item["expect_status"] = st
        manifest.append(item)
    cout = out / "checks"
    cout.mkdir(parents=True, exist_ok=True)
    mp = cout / "manifest.json"
    mp.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    cmd = [py, str(batch), str(mp), "--out", str(cout), "--jobs", str(JOBS)]
    for d in reuse:
        cmd += ["--reuse", str(d)]
    rc, so, se = run(cmd)
    (cout / "batch.log").write_text(so + se, encoding="utf-8")
    sm = cout / "summary.md"
    if sm.exists():
        text = sm.read_text(encoding="utf-8")
        return "\n".join(l[2:] if l.startswith("# ") else l for l in text.splitlines()) + "\n"
    return f"_checks batch failed (exit {rc})_\n```\n{tail(se, 10)}\n```\n"


def record_md(videos):
    p = videos / "RECORD_RESULTS.json"
    if not p.exists():
        return "_no RECORD_RESULTS.json (recorder did not finish)_\n"
    r = json.loads(p.read_text(encoding="utf-8"))
    md = f"{r.get('passed', 0)} passed, {r.get('failed', 0)} failed (a failed take is often the doc defect itself).\n"
    bad = [x for x in r.get("results", []) if not x.get("success")]
    if bad:
        md += "\n| Page | Clip | Error |\n|---|---|---|\n"
        for x in bad:
            err = (x.get("error") or "").replace("|", "\\|").replace("\n", " ")[:220]
            md += f"| {x.get('id')} | {x.get('filename', '')} | {err} |\n"
    return md


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=Path("."))
    ap.add_argument("--videos", type=Path, default=Path("autorecorder/videos"))
    ap.add_argument("--out", type=Path, default=Path("out/run"))
    ap.add_argument("--drift", type=Path, help="drift.md to include")
    ap.add_argument("--versions", type=Path, help="versions.md to include")
    ap.add_argument("--title", default=os.environ.get("GITHUB_REPOSITORY", "QA run"))
    ap.add_argument("--checks-only", action="store_true",
                    help="CI shard: run the clip checks only, into <videos>/_shard-checks (no narration, no summary)")
    a = ap.parse_args()
    root, out = a.root.resolve(), a.out.resolve()
    videos = a.videos if a.videos.is_absolute() else (root / a.videos)
    out.mkdir(parents=True, exist_ok=True)
    py = sys.executable
    pages = load_pages(root)

    if a.checks_only:
        sc = videos / SHARD_CHECKS
        print(checks(root, videos, sc, pages, py))
        return 0
    reuse = sorted(p for p in videos.glob(f"{SHARD_CHECKS}/checks") if p.is_dir())
    rows, skipped = narrate(root, videos, out, pages, py)
    chk = checks(root, videos, out, pages, py, reuse)

    md = [f"# {a.title} daily run\n"]
    md.append("## Recording\n\n" + record_md(videos))
    if a.drift and a.drift.exists():
        md.append(a.drift.read_text(encoding="utf-8"))
    else:
        md.append("## Doc drift\n\n_drift report missing: drift unknown, every page was recorded_\n")
    if a.versions and a.versions.exists():
        md.append(a.versions.read_text(encoding="utf-8"))
    else:
        md.append("## Versions\n\n_versions report missing: the committed lockfiles were installed_\n")
    md.append("## Narration (❌/⚠️ pages)\n")
    if skipped:
        md.append(f"_{skipped}_\n")
    elif not rows:
        md.append("_no ❌/⚠️ page has a narration script_\n")
    else:
        md.append("| Clip | Status | Result | Fit flags | Lines without saved audio |\n|---|---|---|---|---|")
        for r in rows:
            md.append(f"| {r['clip']} | {r.get('status', '')} | {r.get('result', '')} | "
                      f"{', '.join(r.get('flags', [])) or '-'} | {', '.join(r.get('noAudio', [])) or '-'} |")
        md.append("\nFlagged lines and missing audio are fixed locally (`narrate.py rewrite` / `tts`), never in CI.\n")
    md.append("## Clip checks\n\n" + chk)
    (out / "narration-summary.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    text = "\n".join(md) + "\n"
    (out / "summary.md").write_text(text, encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
