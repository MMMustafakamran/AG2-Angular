/**
 * How a Notepad note is typed: like the owner types in a hurry (owner instruction 2026-11-08).
 *
 *   - no capital letters at all in prose; no headings, no list markers, almost no full stops
 *   - sloppy spacing: a missing space after a comma, the odd double space, two short words run together
 *   - chat shorthand: you -> u, your -> ur, apostrophes dropped (dont, isnt, thats), please -> pls
 *   - typos: some fixed with backspace ('\b', handled by typeInNotepad) a key or two later,
 *     several left in (swapped or doubled letters)
 *   - no long URLs: the scheme is dropped ("https://example.com/x" -> "example.com/x")
 *
 * Code stays exact (it is the evidence): identifiers with inner capitals, anything with . / ( ) < > = ` " ',
 * and numbers / finding numbers ("#7") are never changed. ALL-CAPS file names like FINDINGS.md are lowercased.
 * Deterministic per note, so a re-record types the same thing.
 */
export function humanizeNote(text: string): string {
  let seed = 0;
  for (const c of text) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const NEAR: Record<string, string> = { a: 's', s: 'a', e: 'r', r: 'e', t: 'r', o: 'i', i: 'o', n: 'm', m: 'n', h: 'j', d: 's', l: 'k', u: 'y', c: 'v' };
  const SHORT: Record<string, string> = {
    you: 'u', your: 'ur', "you're": 'ur', please: 'pls', because: 'bc', "don't": 'dont', "doesn't": 'doesnt',
    "isn't": 'isnt', "can't": 'cant', "won't": 'wont', "didn't": 'didnt', "it's": 'its', "that's": 'thats',
    "there's": 'theres', "i'm": 'im', "i've": 'ive', "wasn't": 'wasnt', "aren't": 'arent',
  };
  const isCode = (w: string) =>
    /[._/()<>=`{}\[\]:]/.test(w.replace(/^[("'`]+|[)"'`,.;:!?]+$/g, '')) && !/^[A-Z]+\.md$/.test(w.replace(/[^\w.]/g, '')) ||
    /[a-z][A-Z]/.test(w) || /\d/.test(w);

  // 1. Strip note structure: heading prefixes, list markers, URL schemes.
  const lines = text
    .replace(/(https?|wss?):\/\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(FINDING|NOTE|ISSUE)\s*[-:–—]\s*/i, '').replace(/^\s*(\d+[.)]|[-*•])\s+/, ''));

  let fixes = 0, left = 0, joins = 0;
  const outLines = lines.map((line) => {
    const toks = line.split(/(\s+)/);
    const out: string[] = [];
    for (let k = 0; k < toks.length; k++) {
      let tok = toks[k];
      if (/^\s+$/.test(tok)) {
        // spacing: occasional double space; occasionally run two short plain words together
        const prev = out[out.length - 1] ?? '', next = toks[k + 1] ?? '';
        if (joins < 2 && /^[a-z]{1,4}$/.test(prev) && /^[a-z]{1,5}$/.test(next) && rnd() < 0.06) { joins++; continue; }
        out.push(rnd() < 0.05 ? '  ' : ' ');
        continue;
      }
      if (!tok) continue;
      if (isCode(tok)) { out.push(tok); continue; }

      // prose: lowercase, shorthand, drop most full stops, sloppy comma spacing
      let w = tok.toLowerCase().replace(/’/g, "'");
      const core = w.replace(/[,.;:!?]+$/, '');
      const tail = w.slice(core.length);
      w = (SHORT[core] ?? core.replace(/'/g, '')) + tail;
      w = w.replace(/\.$/, rnd() < 0.8 ? '' : '.');

      const m = /^([a-z]+)(.*)$/.exec(w);
      if (m && m[1].length >= 4) {
        const word = m[1], rest = m[2];
        const r = rnd();
        if (r < 0.10 && fixes < 5) {
          // hit a neighbouring key, type on a letter or two, notice, back up, retype
          const i = 1 + Math.floor(rnd() * (word.length - 2));
          const wrong = NEAR[word[i]] ?? word[i];
          const extra = word.slice(i + 1, i + 1 + 1 + Math.floor(rnd() * 2));
          w = word.slice(0, i) + wrong + extra + '\b'.repeat(1 + extra.length) + word.slice(i) + rest;
          fixes++;
        } else if (r > 0.93 && left < 4) {
          // a slip left in: swapped or doubled letter
          const i = 1 + Math.floor(rnd() * (word.length - 2));
          w = (rnd() < 0.6 ? word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)
                           : word.slice(0, i) + word[i] + word.slice(i)) + rest;
          left++;
        }
      }
      // comma glued to the next word now and then ("broken,the")
      if (w.endsWith(',') && rnd() < 0.3 && /^\s+$/.test(toks[k + 1] ?? '')) { out.push(w); k++; continue; }
      out.push(w);
    }
    return out.join('').replace(/\s+$/, '');
  });
  return outLines.join('\n').replace(/\n{3,}/g, '\n\n');
}
