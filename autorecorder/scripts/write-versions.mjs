#!/usr/bin/env node
/**
 * frontend/VERSIONS.md — the file the Quickstart demo puts on screen.
 *
 * The Quickstart clip has always led with the dependency manifest, on the
 * reasoning that a demo is only meaningful against known versions. But
 * package.json declares RANGES: it shows "^1.69.2" while the install it is
 * documenting resolved 1.69.3. The one file chosen to prove "known versions"
 * was the one file that could not show them.
 *
 * package-lock.json does carry the resolved versions, but it is 24k lines and
 * scatters the interesting entries hundreds of lines apart, so no highlight
 * range shows them together and every dependency change moves the line numbers.
 *
 * Hence this: small, ordered, and generated after install from what is
 * actually in node_modules and uv.lock. Not committed -- it describes one
 * install.
 *
 * `npm run doctor` runs this first, so a fresh checkout materialises the file
 * without a full recording. Keep the five header lines as they are: the
 * Quickstart page in config/pages.config.ts highlights from line 6.
 *
 *   node scripts/write-versions.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(HERE, '..', '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
// This repo's own backend dir (never a sibling repo: CI only has this checkout).
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const OUT = path.join(FRONTEND_DIR, 'VERSIONS.md');

/**
 * What is actually installed -- not what package.json asks for.
 *
 * Reading `pkg.dependencies` gives the FLOOR of a range rather than the
 * version in use: an install of @copilotkit/react-core 1.69.3 read as
 * "^1.69.2". Read the installed tree instead, and keep the declared range
 * alongside when the two differ, so a range bump is still visible.
 */
function resolveVersion(dir, pkg, name) {
  const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  let installed;
  try {
    const manifest = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
    installed = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
  } catch {
    // Not installed: written before install, or after a failed one.
  }
  if (!declared && !installed) return 'n/a';
  if (!installed) return `${declared} (not installed)`;
  if (!declared) return installed;
  return declared === installed ? installed : `${installed} (declared ${declared})`;
}

/**
 * Backend versions, read from uv.lock rather than the pyproject specifiers.
 *
 * The same defect the frontend map had: pyproject declares floors
 * (`agno>=2.8.7`) while `uv sync --upgrade` resolves past them, so the
 * specifier names a version the environment has moved off. uv.lock names what
 * is actually installed, which makes it the backend's equivalent of reading
 * node_modules.
 */
function lockedVersions(dir) {
  const locked = new Map();
  try {
    const lock = fs.readFileSync(path.join(dir, 'uv.lock'), 'utf8');
    // uv.lock is generated TOML and every entry is a [[package]] table whose
    // first two keys are name and version, in that order. A regex reads that
    // reliably and saves taking on a TOML parser for four lines of work.
    const entry = /\[\[package\]\]\s*\nname = "([^"]+)"\s*\nversion = "([^"]+)"/g;
    for (const m of lock.matchAll(entry)) locked.set(m[1], m[2]);
  } catch {
    // No lock file: uv sync never ran, or this backend is not Python.
  }
  return locked;
}

/**
 * Derived from pyproject's own dependency list rather than a hardcoded set of
 * interesting names, so adding a dependency cannot silently leave it out.
 */
function backendVersions(dir) {
  const out = {};
  let pyproject;
  try {
    pyproject = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8');
  } catch {
    return out;
  }

  out['requires-python'] = pyproject.match(/requires-python\s*=\s*"([^"]+)"/)?.[1] || 'n/a';

  const locked = lockedVersions(dir);
  const block = pyproject.match(/^dependencies\s*=\s*\[([\s\S]*?)^\]/m)?.[1] ?? '';

  // Requiring the leading quote skips the comment lines inside the array. The
  // optional group after the name drops extras -- "sqlalchemy[asyncio]" is
  // locked under plain "sqlalchemy".
  for (const m of block.matchAll(/^\s*"([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*([^"]*)"/gm)) {
    const [, name, spec] = m;
    const declared = spec.trim();
    const installed = locked.get(name.toLowerCase());
    if (installed) {
      out[name] = declared ? `${installed} (declared ${declared})` : installed;
    } else {
      out[name] = declared ? `${declared} (not locked)` : 'n/a';
    }
  }
  return out;
}

/** Node backend: every dependency in its package.json, read from its node_modules. */
function nodeBackendVersions(dir) {
  const out = {};
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return out;
  }
  for (const name of Object.keys(pkg.dependencies ?? {})) out[name] = resolveVersion(dir, pkg, name);
  return out;
}

function getPackageVersions() {
  const versions = { frontend: {}, backend: {} };
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(FRONTEND_DIR, 'package.json'), 'utf8'));
    versions.frontend = {
      '@copilotkit/angular': resolveVersion(FRONTEND_DIR, pkg, '@copilotkit/angular'),
      '@copilotkit/runtime': resolveVersion(FRONTEND_DIR, pkg, '@copilotkit/runtime'),
      '@angular/core': resolveVersion(FRONTEND_DIR, pkg, '@angular/core'),
      '@ag-ui/client': resolveVersion(FRONTEND_DIR, pkg, '@ag-ui/client'),
    };
  } catch {
    // ignore
  }
  try {
    if (BACKEND_DIR) {
      versions.backend = backendVersions(BACKEND_DIR);
      if (!Object.keys(versions.backend).length) versions.backend = nodeBackendVersions(BACKEND_DIR);
    }
  } catch {
    // ignore
  }
  return versions;
}

function pad(rows) {
  const width = Math.max(0, ...rows.map(([name]) => name.length));
  return rows.map(([name, version]) => `${name.padEnd(width)}  ${version}`);
}

export function writeVersionsFile() {
  const { frontend, backend } = getPackageVersions();

  const lines = [
    '# Versions in this recording',
    '',
    '# Generated after install. package.json declares RANGES; these are the',
    '# versions those ranges actually resolved to for this install.',
    '',
    '## Frontend',
    '',
    ...pad(Object.entries(frontend ?? {})),
  ];

  if (backend && Object.keys(backend).length) {
    lines.push('', '## Backend', '', ...pad(Object.entries(backend)));
  }
  lines.push('');

  fs.writeFileSync(OUT, lines.join('\n'));
  return OUT;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Wrote ${writeVersionsFile()}`);
}
