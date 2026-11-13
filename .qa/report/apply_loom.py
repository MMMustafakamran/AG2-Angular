"""Write Loom URLs found by loom-match.md into an assignment.json.

Usage: python apply_loom.py <assignment.json> <matches.json> [--overwrite] [--dry-run]

matches.json: {"<clip id>": "https://www.loom.com/share/<32 hex>", ...}
          or  [{"clip": "...", "url": "...", "title": "..."}, ...]
Links that already have a different URL are left alone unless --overwrite.
"""
import argparse, datetime, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load, save, validate

URL = re.compile(r'^https://www\.loom\.com/share/[0-9a-f]{32}$')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('assignment')
    ap.add_argument('matches')
    ap.add_argument('--overwrite', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf8')
    a, m = load(args.assignment), load(args.matches)
    if isinstance(m, list):
        m = {x['clip']: x['url'] for x in m}
    m = {k: v.split('?')[0].rstrip('/') for k, v in m.items()}
    bad = [k for k, v in m.items() if not URL.match(v)]
    for k in bad:
        print('  skip (not a loom share URL):', k, m.pop(k))
    used, changed = set(), 0
    for p in a['pages']:
        for l in p.get('links', []):
            c = l.get('clip')
            if c not in m:
                continue
            used.add(c)
            if l.get('loom') == m[c]:
                continue
            if l.get('loom') and not args.overwrite:
                print(f'  keep {c}: has {l["loom"]} (match {m[c]}; --overwrite to replace)')
                continue
            print(f'  set  {c} -> {m[c]}')
            l['loom'] = m[c]
            l['filmed'] = datetime.date.today().isoformat()
            changed += 1
    for c in sorted(set(m) - used):
        print('  unmatched (no such clip in this assignment):', c)
    missing = [l['clip'] for p in a['pages'] if p['reachable'] != 'none' for l in p.get('links', []) if l.get('clip') and not l.get('loom')]
    print(f'{changed} links updated; still without Loom: {missing or "none"}')
    errs = validate(a, args.assignment)
    if errs:
        sys.exit('refusing to save, invalid:\n  ' + '\n  '.join(errs))
    if changed and not args.dry_run:
        save(args.assignment, a)
        print('saved', args.assignment)


if __name__ == '__main__':
    main()
