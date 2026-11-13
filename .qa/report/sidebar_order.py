"""Order a repo's report rows like the docs sidebar (doc-snapshot/sidebar.json).

Rewrites assignment.json in place:
- pages are sorted in sidebar order;
- `sections` becomes one header row per sidebar group level, e.g.
  "Basics" (Section), "Chat" (Sub section), "Prebuilt Components" (Sub section);
- each guide page's `group` is its deepest sidebar group, and `child` is set for pages two or
  more levels deep, so the report prefixes them with "- ".
Pages missing from the sidebar keep their place at the end of their old group.
Usage: python sidebar_order.py <repo dir> [--dry]
"""
import json, os, sys

repo = sys.argv[1]
dry = "--dry" in sys.argv
ap = os.path.join(repo, "assignment.json")
a = json.load(open(ap, encoding="utf-8"))
sb = json.load(open(os.path.join(repo, "doc-snapshot", "sidebar.json"), encoding="utf-8"))
root = "/" + sb["root"].strip("/")

order, gpath = {}, {}
for i, p in enumerate(sb["pages"]):
    path = p["url"].rstrip("/")
    doc = path[len(root):].strip("/") if path.startswith(root) else path.strip("/")
    order.setdefault(doc, i)
    gpath.setdefault(doc, [g.strip() for g in p["group"].split(">") if g.strip()])

norm = lambda d: (d or "").split("?")[0].strip("/")
sections, used = [], set()


def new_key(label, depth):
    k = label
    while k in used:
        k += "​"  # invisible: labels like "Chat" can head two runs of rows
    used.add(k)
    sections.append({"label": k, "cells": ["Section" if depth == 1 else "Sub section"]})
    return k


guides = [p for p in a["pages"] if p.get("kind", "guide") == "guide"]
others = [p for p in a["pages"] if p.get("kind", "guide") != "guide"]
guides.sort(key=lambda p: order.get(norm(p.get("docPath")), 10**6))
missing, cur, keys = [], [], []  # cur: current header path; keys[i]: header key at depth i+1
for p in guides:
    d = norm(p.get("docPath"))
    if d not in order:
        missing.append(p.get("id"))
        continue
    parts = gpath[d]
    if not parts:
        p["group"], p["child"] = None, False
        continue
    c = 0
    while c < min(len(cur), len(parts)) and cur[c] == parts[c]:
        c += 1
    if c == len(parts) and len(cur) > len(parts):
        c -= 1  # back up to a shallower group after a nested one: reopen its header (sidebar order)
    keys = keys[:c]
    for n in range(c, len(parts)):
        keys.append(new_key(parts[n], n + 1))
    cur = list(parts)
    p["group"] = keys[-1]
    p["child"] = len(parts) >= 2
# pages not in the sidebar: keep their old group if it still exists, else top level
labels = {s["label"] for s in sections}
for p in guides:
    if p.get("id") in missing and p.get("group") not in labels:
        p["group"] = None
a["pages"] = others + guides
a["sections"] = sections
print(f"{repo}: {len(sections)} section rows, {len(guides)} guide pages, not in sidebar: {missing}")
if not dry:
    open(ap, "w", encoding="utf-8", newline="\n").write(json.dumps(a, ensure_ascii=False, indent=1) + "\n")
