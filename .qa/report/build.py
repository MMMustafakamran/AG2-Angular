"""Build one framework's paste-friendly status HTML from per-repo assignment.json files.

Usage: python build.py <assignment.json>... --out file.html

Plain tables, inline styles, no classes/<th>/JS, so it pastes cleanly into the team Google Doc.
Framework-level settings (h1, title, style, quickstart table) come from the first assignment.
Pages with reachable "none" or an "excluded" reason are left out.
"""
import argparse, html, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load, validate, page_url, visible

TD = 'border:1px solid #000;padding:6px 8px;vertical-align:top'
TABLE = 'border-collapse:collapse;margin-bottom:24px;width:100%'
STATUS_WORDS = {'✅': 'Working', '⚠️': 'Partially working', '❌': 'Not working'}
PY_ONLY = 'The code is written only in Python.'
warnings = []


def esc(s):
    return html.escape(s.replace('`', ''))   # notes may carry `code` marks; the doc gets plain text


def href(l):
    return l['loom'] or '#LOOM-' + l['clip']


def td(v, extra=''):
    return f'<td style="{TD}{extra}">{v}</td>'


def row(cells):
    return '<tr>' + ''.join(cells) + '</tr>'


# ------------------------------------------------------------------ result cells
def team_cell(a, p):
    links = p.get('links', [])
    if any(not l.get('clip') for l in links):
        warnings.append(f"{a['repo']}: {p['id']}: clip not recorded yet, result cell left empty")
        return ''
    st = p['status']
    if st == 'python-only':
        return PY_ONLY
    out = [st] if st else []
    for l in links:
        text = l.get('text') or (f"{p['label']} - {a['report'].get('linkSuffix', 'JS')}" if st == '✅' else 'Issue')
        out.append(f'<a href="{href(l)}">{esc(text)}</a>')
    out += [esc(n) for n in p.get('notes', [])]
    b = p.get('block')
    if b:
        tc = a.get('testedContext', {})
        vers = ', '.join(f'“{k}”: “{v}”' for k, v in a.get('versions', {}).items() if k.startswith('@copilotkit/'))
        out += ['Area/Surface: ' + esc(b['area']), 'Problem: ' + esc(b['problem']), 'Tested context:',
                'OS: ' + esc(tc.get('os', '')), 'Package Manager and version: ' + esc(tc.get('packageManager', '')),
                vers, 'Loom Video ' + (f'<a href="{href(links[0])}">Loom</a>' if b.get('loomInBlock') and links else '')]
    return '<br>'.join(out)


def status_cell(a, p):
    st = p['status']
    if st == 'python-only':
        return PY_ONLY
    links = p.get('links', [])
    head = st + (' ' + STATUS_WORDS[st] if st in STATUS_WORDS else '')
    if links and links[0].get('clip') is None and not links[0].get('loom'):
        warnings.append(f"{a['repo']}: {p['id']}: clip not recorded yet")
        links = []
    # status style: the link text is always the status label (emoji + word), never a per-clip text
    first = [f'<a href="{href(l)}">{esc(head)}</a>' for l in links] or [esc(head)]
    notes = [f'<span style="font-size:9pt">{esc(n)}</span>' for n in p.get('notes', [])]
    return '<br>'.join(first + notes)


def cell(a, p):
    if a.get('quickstartBlocked') and p.get('kind', 'guide') == 'guide' and p.get('notTested'):
        # QA-RULES 8b: a page never built because the quickstart blocks the framework
        return '<br>'.join(['❌', esc('Blocked: ' + a['quickstartBlocked']), esc('Not tested: nothing to build on until the quickstart works.')])
    c = (team_cell if a['report']['style'] == 'team' else status_cell)(a, p)
    # Owner rule (2026-11-12, QA-RULES 8b): when the framework's quickstart is a complete block (level 1, no
    # usable setup), every other page is blocked for a reader: the row is ❌ "Blocked", and what the page did
    # on a hand-built setup follows as secondary info. assignment.json top level: "quickstartBlocked": "<reason>".
    qb = a.get('quickstartBlocked')
    if qb and p.get('kind', 'guide') == 'guide' and p['status'] in ('✅', '⚠️', '❌') and c:
        tested = {'✅': 'works', '⚠️': 'works with a minor issue', '❌': 'also fails on its own'}[p['status']]
        if c.startswith(p['status'] + '<br>'):
            c = c[len(p['status']) + 4:]  # the row's emoji is ❌ now; the link and notes stay
        c = '<br>'.join(['❌', esc('Blocked: ' + qb),
                         esc(f'Tested anyway on a setup built by hand: the page {tested}.'), c])
    return c


def label_cell(a, p):
    text = ('- ' if p.get('child') else '') + p['label']
    u = page_url(a, p)
    return f'<a href="{html.escape(u)}">{esc(text)}</a>' if u else esc(text)


# ------------------------------------------------------------------ tables
def guides_table(a):
    r, cols = a['report'], a['report']['columns']
    status = r['style'] == 'status'
    rc = r.get('resultColumn', len(cols) - 1)
    center = ';text-align:center' if status else ''
    out = [f'<table style="{TABLE}">', row(td(f'<b>{esc(c)}</b>', center if status else '') for c in cols)]
    pages = [p for p in a['pages'] if p.get('kind', 'guide') == 'guide' and visible(p)]

    def page_rows(group):
        for p in pages:
            if p.get('group') == group:
                vals = [''] * len(cols)
                vals[0], vals[rc] = label_cell(a, p), cell(a, p)
                out.append(row(td(v, ';width:30%' if i == 0 else (center if i == rc else '')) for i, v in enumerate(vals)))

    page_rows(None)
    for s in a['sections']:
        if status:
            out.append(row([td(f'<b>{esc(s["label"])}</b>', ';width:30%')] + [td(f'<b>{esc(c)}</b>', center) for c in s['cells']]))
        else:
            out.append(row([td(f'<b>{esc(s["label"])}</b>', ';width:30%')] + [td(esc(c)) for c in s['cells']]))
        page_rows(s['label'])
    out.append('</table>')
    return out


def quickstart_table(assignments):
    r0 = assignments[0]['report']
    status = r0['style'] == 'status'
    center = ';text-align:center' if status else ''
    out = [f'<table style="{TABLE}">']
    if r0.get('quickstartHeader'):
        out.append(row(td(f'<b>{esc(c)}</b>', ';text-align:center') for c in r0['quickstartHeader']))
    for a in assignments:
        for p in a['pages']:
            if p.get('kind') == 'quickstart' and visible(p):
                out.append(row([td(label_cell(a, p), ';width:30%'), td(cell(a, p), center)]))
    out.append('</table>')
    return out


def build(assignments):
    r0 = assignments[0]['report']
    for a in assignments[1:]:
        for k in ('style', 'h1', 'title'):
            if a['report'].get(k) != r0.get(k):
                warnings.append(f"{a['repo']}: report.{k} differs from the first assignment; using the first")
    h = ['<!doctype html>', f'<html><head><meta charset="utf-8"><title>{esc(r0["title"])}</title></head>',
         '<body style="font-family:Arial,sans-serif;font-size:11pt;max-width:1100px;margin:16px auto;padding:0 16px">',
         f'<h1>{esc(r0["h1"])}</h1>', f'<h2>{esc(r0.get("quickstartHeading", "Quickstarts"))}</h2>']
    h += quickstart_table(assignments)
    for a in assignments:
        if any(p.get('kind', 'guide') == 'guide' and visible(p) for p in a['pages']) or a['sections']:
            h.append(f'<h2>{esc(a["report"]["guidesHeading"])}</h2>')
            h += guides_table(a)
    if r0.get('clipsToUpload'):
        body = '\n'.join(h)
        used = sorted(set(re.findall(r'#LOOM-([\w-]+)', body)))
        h += ['<h2>Clips to upload</h2>',
              '<p>Each link above points at #LOOM-&lt;clip&gt;. Replace it with the Loom URL of that clip '
              '(approved clips are in 3-output/&lt;date&gt;/deliver/).</p>',
              f'<table style="{TABLE}">', row([td('<b>Clip</b>'), td('<b>Placeholder</b>')])]
        h += [row([td(c + '.*'), td('#LOOM-' + c)]) for c in used]
        h.append('</table>')
    h.append('</body></html>')
    return '\n'.join(h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('assignments', nargs='+')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    assignments = [load(p) for p in args.assignments]
    errs = [e for p, a in zip(args.assignments, assignments) for e in validate(a, p)]
    if errs:
        sys.exit('invalid assignment:\n  ' + '\n  '.join(errs))
    doc = build(assignments)
    with open(args.out, 'w', encoding='utf8', newline='\n') as f:
        f.write(doc)
    rows = sum(1 for a in assignments for p in a['pages'] if visible(p))
    placeholders = len(set(re.findall(r'#LOOM-([\w-]+)"', doc)))
    print(f'wrote {args.out}: {rows} page rows, {placeholders} clips without a Loom URL')
    for w in warnings:
        print('  warn:', w)


if __name__ == '__main__':
    main()
