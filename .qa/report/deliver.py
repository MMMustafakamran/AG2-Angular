"""Collect the final clips for manual Loom upload into 3-output/<date>/deliver/ with a manifest.

Usage:
  python deliver.py --date 2026-11-07 --from DIR [DIR...] [--assignment A.json...] [--only-approved [A.json...]]
                    [--all] [--manifest-out PATH] [--apply]

- Clips come from the links of reachable pages in the given assignments (default: out/*.assignment.json).
- Per clip, a narrated <clip>.mp4 in any --from dir wins over <clip>.webm; within a kind, --from order wins.
  Dirs are not searched recursively (so e.g. LangGraph-upload/_not-for-upload is never picked up).
- Files are named <clip>.<ext>: Loom uses the file name as the video title, which loom-match.md relies on.
- Only clips that still need upload (no Loom URL) are copied, unless --all. The manifest lists every clip.
- --only-approved: only pages whose review.verdict is "approved"; any paths given are added to the assignments.
- Dry run by default (prints the plan, writes nothing except --manifest-out). --apply copies and writes manifest.json.
"""
import argparse, glob, hashlib, json, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import WS, HERE, load, iter_links


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def find(clip, dirs):
    hits = [os.path.join(d, clip + ext) for ext in ('.mp4', '.webm') for d in dirs
            if os.path.isfile(os.path.join(d, clip + ext))]
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--date', required=True)
    ap.add_argument('--from', dest='dirs', nargs='+', required=True)
    ap.add_argument('--assignment', nargs='*', default=[])
    ap.add_argument('--only-approved', nargs='*', default=None)
    ap.add_argument('--all', action='store_true', help='also copy clips that already have a Loom URL')
    ap.add_argument('--manifest-out', help='also write the manifest here (works in dry run)')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf8')

    paths = list(args.assignment) + list(args.only_approved or [])
    if not paths:
        paths = sorted(glob.glob(os.path.join(HERE, 'out', '*.assignment.json')))
    dest = os.path.join(WS, '3-output', args.date, 'deliver')
    entries = []
    for path in paths:
        a = load(path)
        for p, l in iter_links(a, visible_only=True):
            if args.only_approved is not None and (p.get('review') or {}).get('verdict') != 'approved':
                continue
            clip = l.get('clip')
            hits = find(clip, args.dirs) if clip else []
            src = hits[0] if hits else None
            e = {'clip': clip, 'repo': a['repo'], 'page': p['id'], 'status': p['status'],
                 'source': os.path.relpath(src, WS).replace('\\', '/') if src else None,
                 'file': os.path.basename(src) if src else None,
                 'sha256': sha256(src) if src else None,
                 'needs_upload': not l.get('loom'), 'loom': l.get('loom'),
                 'alternatives': [os.path.relpath(h, WS).replace('\\', '/') for h in hits[1:]]}
            e['copy'] = bool(src) and (e['needs_upload'] or args.all)
            entries.append(e)

    manifest = {'date': args.date, 'dest': os.path.relpath(dest, WS).replace('\\', '/'), 'from': args.dirs,
                'assignments': [os.path.relpath(p, WS).replace('\\', '/') for p in paths], 'clips': entries}
    print(f"{'APPLY' if args.apply else 'DRY RUN'} -> {manifest['dest']}")
    for e in entries:
        tag = 'COPY' if e['copy'] else ('MISSING' if not e['source'] else 'skip (on Loom)')
        print(f"  {tag:15} {e['clip'] or '(no clip: ' + e['page'] + ')'}  <- {e['source']}")
    n_copy = sum(e['copy'] for e in entries)
    n_missing = sum(1 for e in entries if not e['source'])
    print(f"{len(entries)} clips | to copy {n_copy} | on Loom {sum(not e['needs_upload'] for e in entries)} | missing {n_missing}")

    if args.manifest_out:
        with open(args.manifest_out, 'w', encoding='utf8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)
    if not args.apply:
        print('dry run: nothing copied (add --apply)')
        return
    os.makedirs(dest, exist_ok=True)
    for e in entries:
        if e['copy']:
            target = os.path.join(dest, e['file'])
            if os.path.exists(target) and sha256(target) == e['sha256']:
                continue
            shutil.copy2(os.path.join(WS, e['source']), target)
    with open(os.path.join(dest, 'manifest.json'), 'w', encoding='utf8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f'copied {n_copy} files, wrote {manifest["dest"]}/manifest.json')


if __name__ == '__main__':
    main()
