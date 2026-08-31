/**
 * Syntax highlighting for the code shown on route pages.
 *
 * `highlight.js` is already a dependency of `@copilotkit/angular` (it backs the
 * chat's markdown rendering), so this costs only the language grammars. The
 * core build is imported rather than the default one, which would register
 * nearly two hundred languages we never use.
 *
 * Output is `<span class="hljs-…">` markup only, which Angular's default
 * sanitizer passes through untouched — so consumers can bind it with
 * `[innerHTML]` without bypassing security.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);

export type CodeLanguage =
  | 'typescript'
  | 'xml'
  | 'css'
  | 'bash'
  | 'python'
  | 'json';

/** Angular templates live inside `.ts` files, so TypeScript is the safe default. */
export function languageForPath(path: string): CodeLanguage {
  if (path.endsWith('.html')) return 'xml';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.sh')) return 'bash';
  return 'typescript';
}

/**
 * Returns highlighted HTML, or HTML-escaped plain text if the grammar throws —
 * a broken snippet should still be readable rather than blowing up the page.
 */
export function highlight(code: string, language: CodeLanguage): string {
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
