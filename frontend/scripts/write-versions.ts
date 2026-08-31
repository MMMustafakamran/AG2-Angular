/**
 * frontend/VERSIONS.md — the file the Quickstart demo puts on screen.
 *
 * The Quickstart clip leads with the dependency manifest, on the reasoning
 * that a demo is only meaningful against known versions. But package.json
 * declares RANGES: it shows `^0.4.0` while the run it documents may have
 * installed something newer. The one file chosen to prove "known versions" was
 * the one file that could not show them.
 *
 * package-lock.json does carry the resolved versions, but it is tens of
 * thousands of lines and scatters the interesting entries hundreds of lines
 * apart, so no highlight range shows them together and every dependency change
 * moves the line numbers.
 *
 * Hence this: small, ordered, and generated after install by reading
 * node_modules and backend/uv.lock — what actually resolved, not what was
 * asked for. Regenerate with `npm run gen:versions`. Not a description of the
 * repo; a description of one install.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const backendDir = join(frontendDir, '..', 'backend');
const out = join(frontendDir, 'VERSIONS.md');

/** The packages the Quickstart clip is about — the integration seam, in order. */
const FRONTEND_PACKAGES = [
  '@copilotkit/angular',
  '@copilotkit/runtime',
  '@ag-ui/client',
  '@angular/core',
  '@angular/ssr',
];

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function resolveVersion(pkg: Manifest, name: string): string {
  const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  let installed: string | undefined;
  try {
    const manifest = join(frontendDir, 'node_modules', ...name.split('/'), 'package.json');
    installed = JSON.parse(readFileSync(manifest, 'utf8')).version;
  } catch {
    // Not installed: written before install, or after a failed one.
  }
  if (!declared && !installed) return 'n/a';
  if (!installed) return `${declared} (not installed)`;
  if (!declared) return installed;
  return declared === installed ? installed : `${installed} (declared ${declared})`;
}

/**
 * Backend versions come from uv.lock, not the pyproject specifiers.
 *
 * pyproject declares floors (`ag2[ag-ui,openai]>=1.0.3`) while `uv sync` may
 * resolve well past them, so the specifier names a version that may never have
 * run. The lock names what did — the backend's equivalent of reading
 * node_modules.
 */
function lockedVersions(): Map<string, string> {
  const locked = new Map<string, string>();
  try {
    const lock = readFileSync(join(backendDir, 'uv.lock'), 'utf8');
    // uv.lock is generated TOML: every entry is a [[package]] table whose
    // first two keys are name and version, in that order.
    const entry = /\[\[package\]\]\s*\nname = "([^"]+)"\s*\nversion = "([^"]+)"/g;
    for (const m of lock.matchAll(entry)) locked.set(m[1], m[2]);
  } catch {
    // No lock file: uv sync never ran.
  }
  return locked;
}

/**
 * Read from pyproject's own dependency list rather than a hardcoded set, so
 * adding a dependency cannot silently leave it out of every future run.
 */
function backendVersions(): Record<string, string> {
  const result: Record<string, string> = {};
  let pyproject: string;
  try {
    pyproject = readFileSync(join(backendDir, 'pyproject.toml'), 'utf8');
  } catch {
    return result;
  }

  result['requires-python'] =
    pyproject.match(/requires-python\s*=\s*"([^"]+)"/)?.[1] ?? 'n/a';

  const locked = lockedVersions();
  const block = pyproject.match(/^dependencies\s*=\s*\[([\s\S]*?)^\]/m)?.[1] ?? '';

  // Requiring the leading quote skips comment lines inside the array. The
  // optional group after the name drops extras — `ag2[ag-ui,openai]` is locked
  // under plain `ag2`.
  for (const m of block.matchAll(/^\s*"([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*([^"]*)"/gm)) {
    const [, name, spec] = m;
    const declared = spec.trim();
    const installed = locked.get(name.toLowerCase());
    if (installed) {
      result[name] = declared ? `${installed} (declared ${declared})` : installed;
    } else {
      result[name] = declared ? `${declared} (not locked)` : 'n/a';
    }
  }
  return result;
}

function pad(rows: [string, string][]): string[] {
  const width = Math.max(0, ...rows.map(([name]) => name.length));
  return rows.map(([name, version]) => `${name.padEnd(width)}  ${version}`);
}

const pkg: Manifest = JSON.parse(
  readFileSync(join(frontendDir, 'package.json'), 'utf8'),
);

const frontend: [string, string][] = FRONTEND_PACKAGES.map((name) => [
  name,
  resolveVersion(pkg, name),
]);
const backend = Object.entries(backendVersions()) as [string, string][];

const lines = [
  '# Versions in this recording',
  '',
  '# Generated after install. package.json declares RANGES; these are the',
  '# versions those ranges actually resolved to for this run.',
  '',
  '## Frontend',
  '',
  ...pad(frontend),
];

if (backend.length) {
  lines.push('', '## Backend', '', ...pad(backend));
}
lines.push('');

writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${out}`);
