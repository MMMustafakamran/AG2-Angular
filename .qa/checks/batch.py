#!/usr/bin/env python3
"""Run checks.py over many clips and write summary.json + summary.md. No LLM.

    python batch.py DIR_OR_LIST [...] --out DIR [--jobs 3] [--expect ✅] [--fail-on-issues]

Inputs (any mix):
  - a directory: every *.webm / *.mp4 in it (not recursive); sibling <clip>.timeline.json and
    <clip>.events.jsonl are picked up automatically
  - a single .webm / .mp4
  - a .txt list: one clip path per line (# comments allowed)
  - a .json manifest: [{"clip", "timeline"?, "events"?, "expect_status"?, "note"?}]
    (relative paths resolve against the manifest's folder)
A .mp4 is skipped when a .webm of the same name is in the same input (the .webm is the recording).
"""
from __future__ import annotations

import argparse
import shutil
import concurrent.futures as cf
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import checks  # noqa: E402


def collect(inputs: list[str], expect: str | None) -> list[dict]:
    items: list[dict] = []
    for inp in inputs:
        p = Path(inp)
        if p.is_dir():
            vids = sorted(list(p.glob("*.webm")) + list(p.glob("*.mp4")))
            webm = {v.stem for v in vids if v.suffix == ".webm"}
            items += [{"clip": str(v)} for v in vids if not (v.suffix == ".mp4" and v.stem in webm)]
        elif p.suffix == ".json":
            for it in json.loads(p.read_text(encoding="utf-8")):
                it = dict(it)
                for k in ("clip", "timeline", "events"):
                    if it.get(k) and not Path(it[k]).is_absolute():
                        it[k] = str((p.parent / it[k]).resolve())
                items.append(it)
        elif p.suffix == ".txt":
            items += [{"clip": l.strip()} for l in p.read_text(encoding="utf-8").splitlines()
                      if l.strip() and not l.lstrip().startswith("#")]
        elif p.suffix in (".webm", ".mp4"):
            items.append({"clip": str(p)})
        else:
            sys.exit(f"don't know how to read {inp}")
    for it in items:
        if expect and not it.get("expect_status"):
            it["expect_status"] = expect
    return items


def _row(r: dict) -> dict:
    return {"clip": r["clip"], "expect": r["expect_status"], "ok": r["ok"], "issues": r["issues"],
            "status_signals": r["status_signals"], "look_at": r["look_at"],
            "red_runs": [[x["start"], x["end"] + 1, x["segment"]] for x in r["red_runs"]],
            "timeline": bool(r["timeline"]), "events": bool(r["events"]),
            "duration": r["duration"], "runtime_s": r["runtime_s"], "json": f"{r['clip']}.checks.json"}


def _reused(it: dict, out: Path, reuse: list[Path]) -> dict | None:
    """A result a CI shard already computed for this clip (same expected status): copy it, skip the decode."""
    stem = Path(it["clip"]).stem
    for d in reuse:
        j = d / f"{stem}.checks.json"
        if not j.exists():
            continue
        try:
            r = json.loads(j.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if r.get("expect_status") != it.get("expect_status"):
            continue
        if d.resolve() != out.resolve():
            shutil.copy2(j, out / j.name)
            fr = d / f"{stem}.checks"
            if fr.is_dir():
                shutil.copytree(fr, out / fr.name, dirs_exist_ok=True)
        return _row(r)
    return None


def run_one(it: dict, out: Path, frames: bool, reuse: list[Path] | None = None) -> dict:
    t0 = time.time()
    try:
        if reuse:
            row = _reused(it, out, reuse)
            if row:
                return row
        r = checks.run_checks(Path(it["clip"]), out,
                              Path(it["timeline"]) if it.get("timeline") else None,
                              Path(it["events"]) if it.get("events") else None,
                              it.get("expect_status"), it.get("note"), frames)
        return _row(r)
    except Exception as e:  # one bad clip never stops the batch
        return {"clip": Path(it["clip"]).stem, "expect": it.get("expect_status"), "ok": False,
                "issues": [f"checks crashed: {e}"], "status_signals": [], "look_at": [], "red_runs": [],
                "timeline": False, "events": False, "duration": None,
                "runtime_s": round(time.time() - t0, 1), "json": ""}


def write_summary(rows: list[dict], out: Path, wall: float) -> Path:
    bad = sum(1 for r in rows if not r["ok"])
    L = ["# Clip checks", "", f"{len(rows)} clips · {bad} with issues · wall {wall:.0f}s", "",
         "| clip | expect | ok | issues | status signals | look at | sidecars |", "|---|---|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: (r["ok"], not r["look_at"], r["clip"])):
        cell = lambda xs: "<br>".join(x.replace("|", "/") for x in xs)
        side = ("T" if r["timeline"] else "-") + ("E" if r["events"] else "-")
        link = f"[{r['clip']}]({r['json']})" if r["json"] else r["clip"]
        L.append(f"| {link} | {r['expect'] or ''} | {'✅' if r['ok'] else '❌'} | {cell(r['issues'])} | "
                 f"{cell(r['status_signals'])} | {cell(r['look_at'])} | {side} |")
    path = out / "summary.md"
    path.write_text("\n".join(L) + "\n", encoding="utf-8")
    (out / "summary.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--jobs", type=int, default=3, help="clips checked at once (each runs 2 ffmpeg decodes)")
    ap.add_argument("--expect", help="default expected status for clips without one")
    ap.add_argument("--no-frames", action="store_true")
    ap.add_argument("--reuse", type=Path, action="append", default=[],
                    help="folder(s) with <clip>.checks.json already computed (CI shards); those clips are not re-checked")
    ap.add_argument("--fail-on-issues", action="store_true")
    a = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    items = collect(a.inputs, a.expect)
    a.out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with cf.ThreadPoolExecutor(max(1, a.jobs)) as ex:
        rows = list(ex.map(lambda it: run_one(it, a.out, not a.no_frames, a.reuse), items))
    path = write_summary(rows, a.out, time.time() - t0)
    print(path.read_text(encoding="utf-8"))
    return 1 if (a.fail_on_issues and any(not r["ok"] for r in rows)) else 0


if __name__ == "__main__":
    sys.exit(main())
