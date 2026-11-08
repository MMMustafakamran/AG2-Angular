/**
 * How a Notepad note reads: like the owner jots it down in a hurry (owner, 2026-11-09). The note is
 * pasted into Notepad in one go (typeInNotepad), so there are no backspace corrections any more.
 *
 *   - no title line ("sub-agents - finding #49") and no finding numbers / FINDINGS.md references
 *   - no capital letters at all, error names included (ModuleNotFoundError -> modulenotfound)
 *   - hard tokens shortened: versions to their major ("google-genai 2.x" -> "google genai 2",
 *     "3.0.0" -> "3"), CamelCase error names lose their "Error"
 *   - no brackets, quotes, backticks or colons; most full stops dropped
 *   - imperfect spacing: commas often glued to the next word ("genai 2,new"), the odd double space
 *   - chat shorthand: you -> u, your -> ur, because -> bc, through -> thru, apostrophes dropped
 *   - a few slips left in (swapped or doubled letters) in plain words, never in code-ish tokens
 *   - no long URLs: the scheme is dropped ("https://example.com/x" -> "example.com/x")
 *
 * Code-ish tokens (paths, package names, dotted or CamelCase names) keep their letters, only lowercased.
 * Deterministic per note, so a re-record pastes the same thing.
 */
export function humanizeNote(text: string): string {
  let seed = 0;
  for (const c of text) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const SHORT: Record<string, string> = {
    you: 'u', your: 'ur', "you're": 'ur', please: 'pls', because: 'bc', through: 'thru', "don't": 'dont',
    "doesn't": 'doesnt', "isn't": 'isnt', "can't": 'cant', "won't": 'wont', "didn't": 'didnt', "it's": 'its',
    "that's": 'thats', "there's": 'theres', "i'm": 'im', "i've": 'ive', "wasn't": 'wasnt', "aren't": 'arent',
  };
  const isCodeish = (w: string) => /[._/\\=<>{}\[\]@-]/.test(w) || /\d/.test(w);

  // Drop a title line first (before finding numbers vanish from it): a first line that mentions a
  // finding, or a short line followed by a blank line.
  const raw = text.replace(/(https?|wss?):\/\//g, '').split('\n');
  if (raw.length > 2 && (/finding|#\d/i.test(raw[0]) || (raw[0].split(/\s+/).length <= 6 && raw[1].trim() === ''))) {
    raw.shift();
  }
  const src = raw
    .join('\n')
    // finding references in any form
    .replace(/\(?\s*findings?(\.md)?\s*#\d+([\s,&and]*#\d+)*\s*\)?/gi, '')
    .replace(/\bfindings?\.md\b/gi, '')
    .replace(/#\d+\b/g, '');

  const lines = src
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s+/, '')) // list markers
    .map((l) => l.replace(/[()"`“”‘]/g, ' ')) // brackets / quotes (apostrophes stay for shorthand)
    .filter((l, i, all) => !(l.trim() === '' && (i === 0 || all[i - 1].trim() === ''))); // no blank runs

  let left = 0;
  const outLines = lines.map((line) => {
    const toks = line.split(/(\s+)/);
    const out: string[] = [];
    for (let k = 0; k < toks.length; k++) {
      let tok = toks[k];
      if (/^\s+$/.test(tok)) {
        out.push(rnd() < 0.06 ? '  ' : ' ');
        continue;
      }
      if (!tok) continue;
      // punctuation left over from stripped code (`();` -> `;`) goes
      if (/^[;,.:!?=']+$/.test(tok)) continue;
      const camel = /[a-z][A-Z]/.test(tok);
      // CamelCase error/exception names: lowercase and drop the suffix (ModuleNotFoundError -> modulenotfound)
      tok = tok.replace(/^([A-Z][a-z]+(?:[A-Z][a-z]+)+)(Error|Exception)(:?)$/, (_m, n: string) => n.toLowerCase());
      // versions to their major: 2.x / 3.0.0 / v1.84.1 -> 2 / 3 / 1
      tok = tok.replace(/^v?(\d+)\.(?:\d+|x)(?:\.\d+)*([,.;:]?)$/i, '$1$2');
      // colons go (urls already lost their scheme)
      tok = tok.replace(/:+$/, '').replace(/^:+/, '');
      if (!tok) continue;

      let w = tok.toLowerCase().replace(/’/g, "'");
      if (camel || isCodeish(w)) {
        // a two-part package name looks hand-typed without its hyphen now and then: google-genai -> google genai
        if (/^[a-z]+-[a-z]+$/.test(w) && rnd() < 0.5) w = w.replace('-', ' ');
        out.push(w);
        continue;
      }
      const core = w.replace(/[,.;!?]+$/, '');
      const tail = w.slice(core.length);
      w = (SHORT[core] ?? core.replace(/'/g, '')) + tail;
      w = w.replace(/\.$/, rnd() < 0.85 ? '' : '.');

      const m = /^([a-z]+)(.*)$/.exec(w);
      if (m && m[1].length >= 5 && rnd() > 0.94 && left < 3) {
        const word = m[1];
        const i = 1 + Math.floor(rnd() * (word.length - 2));
        w = (rnd() < 0.6 ? word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)
                         : word.slice(0, i) + word[i] + word.slice(i)) + m[2];
        left++;
      }
      // comma glued to the next word more often than not ("genai 2,new")
      if (w.endsWith(',') && rnd() < 0.65 && /^\s+$/.test(toks[k + 1] ?? '')) { out.push(w); k++; continue; }
      out.push(w);
    }
    return out.join('').replace(/\s+$/, '').replace(/^\s+/, '');
  });
  return outLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
