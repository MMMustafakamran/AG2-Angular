#!/usr/bin/env python3
"""Checkpoint gate for finding clips (CI record job, right after the Record step).

    python .qa/tools/gate.py --pages=a,b,c [--videos autorecorder/videos] [--meta meta.json]
                             [--fail-out gate-failed.txt] [--summary $GITHUB_STEP_SUMMARY] [--title ...]

A finding clip is a page with FINDING_EVIDENCE (and every demoMayError page). Its timeline must have:
  - an `evidence` mark (when the page has evidence) and every `evidence` checkpoint ok;
  - `notepad` and `notepad-closed` marks.
The recorder's `failure` mark / failure terminal is expected on finding clips and is not a gate failure.
Failing page ids go to --fail-out (comma-separated; empty file = all passed). With --summary, a table
of the failures is appended under --title. Exit 0 always: the workflow decides (one retake, then warn).
The page table (filename, evidence, flags) comes from `evidence_check.mjs --dump` (run here if --meta is missing).
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def load_meta(path: str | None) -> list:
    if path and Path(path).is_file():
        return json.loads(Path(path).read_text(encoding="utf-8"))
    out = path or "gate-meta.json"
    tool = Path(__file__).with_name("evidence_check.mjs")
    subprocess.run(["node", str(tool), f"--dump={out}"], check=True, timeout=180)
    return json.loads(Path(out).read_text(encoding="utf-8"))


def check(page: dict, videos: Path) -> list[str]:
    tl = videos / f"{page['filename']}.timeline.json"
    if not tl.is_file():
        return ["no timeline (clip not recorded)"]
    try:
        d = json.loads(tl.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"timeline unreadable ({type(e).__name__})"]
    labels = [m.get("label") for m in d.get("marks", [])]
    why = []
    if page.get("evidence"):
        if "evidence" not in labels:
            why.append("no evidence mark")
        bad = [c for c in d.get("checkpoints", []) if c.get("label") == "evidence" and not c.get("ok")]
        why += [f"evidence not found: {(c.get('expect') or '')[:90]}" for c in bad]
    for need in ("notepad", "notepad-closed"):
        if need not in labels:
            why.append(f"no {need} mark")
    return why


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", default="")
    ap.add_argument("--videos", default="autorecorder/videos")
    ap.add_argument("--meta")
    ap.add_argument("--fail-out", default="gate-failed.txt")
    ap.add_argument("--summary")
    ap.add_argument("--title", default="Clips that failed the checkpoint gate")
    a = ap.parse_args()
    try:
        meta = load_meta(a.meta)
    except Exception as e:
        print(f"::warning::gate: could not read the page table ({type(e).__name__}: {e}); gate skipped")
        Path(a.fail_out).write_text("", encoding="utf-8")
        return 0
    by_id = {p["id"]: p for p in meta}
    want = [p.strip() for p in a.pages.split(",") if p.strip()] or list(by_id)
    failed = {}
    for pid in want:
        p = by_id.get(pid)
        if not p or not (p.get("evidence") or p.get("demoMayError")):
            continue
        why = check(p, Path(a.videos))
        print(f"gate {pid}: {'ok' if not why else 'FAIL: ' + '; '.join(why)}")
        if why:
            failed[pid] = why
    Path(a.fail_out).write_text(",".join(failed), encoding="utf-8")
    if failed and a.summary:
        with open(a.summary, "a", encoding="utf-8") as f:
            f.write(f"### {a.title}\n\n| Page | Why |\n|---|---|\n")
            for pid, why in failed.items():
                f.write(f"| {pid} | {'; '.join(why).replace('|', '/')} |\n")
            f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
