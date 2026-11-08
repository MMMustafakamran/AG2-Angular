"""Compare the visible text and links of two report HTMLs (ignores markup and styles).

Usage: python compare.py original.html generated.html
Exit code 0 when they match.
"""
import difflib, html, re, sys


def flatten(path):
    t = open(path, encoding='utf8').read()
    t = re.sub(r'<(style|script|title)[^>]*>.*?</\1>', '', t, flags=re.S)
    lines = []
    for kind, body in re.findall(r'<(h1|h2|p|tr)[^>]*>(.*?)</\1>', t, flags=re.S):
        if kind == 'tr':
            cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', body, flags=re.S)
            out = []
            for c in cells:
                links = re.findall(r'<a href="([^"]*)"', c)
                text = re.sub(r'<br\s*/?>', ' / ', c)
                text = html.unescape(re.sub(r'<[^>]+>', '', text))
                out.append(' '.join(text.split()) + (' {' + ' '.join(links) + '}' if links else ''))
            lines.append(' | '.join(out))
        else:
            lines.append(f'{kind}: ' + ' '.join(html.unescape(re.sub(r'<[^>]+>', '', body)).split()))
    return lines


def main():
    a, b = flatten(sys.argv[1]), flatten(sys.argv[2])
    diff = list(difflib.unified_diff(a, b, sys.argv[1], sys.argv[2], lineterm='', n=0))
    sys.stdout.reconfigure(encoding='utf8')
    print('\n'.join(diff) if diff else f'MATCH ({len(a)} lines of visible text/links)')
    sys.exit(1 if diff else 0)


if __name__ == '__main__':
    main()
