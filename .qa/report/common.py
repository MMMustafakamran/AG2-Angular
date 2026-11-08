"""Shared helpers for the qa-kit report tools (load/save/validate assignment.json)."""
import json, os, re

WS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))  # workspace root (qa-kit lives in 2-shared/)
HERE = os.path.dirname(os.path.abspath(__file__))
STATUSES = ['✅', '⚠️', '❌', 'N/A', '–', 'python-only']
REACHABLE = ['sidebar', 'in-content', 'none']


def load(path):
    with open(path, encoding='utf8') as f:
        return json.load(f)


def save(path, data):
    with open(path, 'w', encoding='utf8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')


def page_url(a, p):
    if p.get('docPath') is None:
        return None
    if re.match(r'https?://', p['docPath']):
        return p['docPath']
    return a['docBase'] + p['docPath']


def visible(p):
    """In the report: reachable by a reader and not excluded by the owner."""
    return p['reachable'] != 'none' and not p.get('excluded')


def iter_links(a, visible_only=False):
    for p in a['pages']:
        if visible_only and not visible(p):
            continue
        for l in p.get('links', []):
            yield p, l


def validate(a, path='assignment'):
    """Light structural check (no jsonschema dependency). Returns a list of problems."""
    errs = []
    for k in ('framework', 'ui', 'repo', 'docBase', 'report', 'pages', 'sections'):
        if k not in a:
            errs.append(f'{path}: missing "{k}"')
    secs = {s['label'] for s in a.get('sections', [])}
    ids, clips = set(), set()
    for p in a.get('pages', []):
        pid = p.get('id')
        if pid in ids:
            errs.append(f'{path}: duplicate page id {pid}')
        ids.add(pid)
        if p.get('status') not in STATUSES:
            errs.append(f'{path}: {pid}: bad status {p.get("status")!r}')
        if p.get('reachable') not in REACHABLE:
            errs.append(f'{path}: {pid}: bad reachable {p.get("reachable")!r}')
        if p.get('kind', 'guide') == 'guide' and p.get('group') is not None and p['group'] not in secs:
            errs.append(f'{path}: {pid}: group {p["group"]!r} is not in sections')
        for l in p.get('links', []):
            c = l.get('clip')
            if c and c in clips:
                errs.append(f'{path}: {pid}: clip {c} used twice')
            clips.add(c)
            if l.get('loom') and not re.match(r'https://www\.loom\.com/share/[0-9a-f]{32}', l['loom']):
                errs.append(f'{path}: {pid}: loom URL looks wrong: {l["loom"]}')
    return errs
