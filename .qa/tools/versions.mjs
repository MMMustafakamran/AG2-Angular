#!/usr/bin/env node
// Install what a new reader gets today (CI plan job, before recording).
// CopilotKit + AG-UI (owner, 2026-11-13): every direct `@copilotkit/*` / `@ag-ui/*` dependency is set to
// the npm `latest` dist-tag (exact version, never `next`) on every run, even past the package.json range.
// Only the CI copy carries it (resolved/<dir>/package.json); the committed package.json is untouched.
// Python: `uv lock --upgrade` (copilotkit / ag-ui-* specs are `>=` floors); a direct copilotkit / ag-ui-*
// dep still below PyPI latest gets its floor raised to latest in the CI copy of pyproject.toml.
// Everything else is re-resolved within its range. The recorder's own deps stay locked (harness tool).
//
//   node .qa/tools/versions.mjs --npm=frontend,agent [--uv=backend] --out=plan-out
//     -> <out>/resolved/<dir>/package.json + package-lock.json | uv.lock (+ pyproject.toml if raised)
//        (copied over the checkout by each record shard before it installs)
//        <out>/versions.json, <out>/versions.md   (committed vs installed vs latest)
// Exit 0 always; a dir that fails to resolve keeps its committed files (said in versions.md).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const list = (s) => (typeof s === "string" ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
const OUT = args.out || "plan-out";
// Always listed (direct deps are listed only when they changed or are behind latest).
const KEY = /^(@copilotkit\/|@ag-ui\/|@langchain\/|@a2ui|@hashbrownai\/|@json-render\/|next$|react$|vue$|langchain$|copilotkit$|ag-ui|google-antigravity$|google-adk$|langgraph$)/;
// npm 12 refuses remote tarball deps by default (tailwind's wasm package uses one); older npm ignores the setting.
const LATEST_NPM = /^@(copilotkit|ag-ui)\//;
const LATEST_PY = /^(copilotkit$|ag-ui-)/;
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 900000, env: { ...process.env, npm_config_allow_remote: "all" } });

function npmVersions(lockFile) {
  const out = {};
  try {
    const l = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    for (const [k, v] of Object.entries(l.packages || {})) {
      const m = k.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)$/);
      if (m && v.version) out[m[1]] = v.version;
    }
  } catch {}
  return out;
}
function uvVersions(lockFile) {
  const out = {};
  try {
    for (const m of fs.readFileSync(lockFile, "utf8").matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g)) out[m[1]] = m[2];
  } catch {}
  return out;
}
async function pypiLatest(names) {
  const out = new Map();
  await Promise.all([...new Set(names)].map(async (n) => {
    try { const r = await fetch(`https://pypi.org/pypi/${n}/json`, { signal: AbortSignal.timeout(20000) }); out.set(n, r.ok ? (await r.json()).info.version : null); }
    catch { out.set(n, null); }
  }));
  return out;
}
// Plain x.y.z compare (enough to never "upgrade" to a lower latest).
const vparts = (v) => String(v).split(/[-+a-z]/)[0].split(".").map((x) => parseInt(x, 10) || 0);
const vlt = (a, b) => { const x = vparts(a), y = vparts(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
async function npmLatest(names) {
  const out = new Map(), q = [...new Set(names)];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (q.length) {
      const n = q.shift();
      try { const r = await fetch(`https://registry.npmjs.org/${n}/latest`, { signal: AbortSignal.timeout(20000) }); out.set(n, r.ok ? (await r.json()).version : null); }
      catch { out.set(n, null); }
    }
  }));
  return out;
}

const rows = [], notes = [];
const errText = (e) => String(e.stderr || e.message).split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 200);
for (const dir of list(args.npm)) {
  const lock = path.join(dir, "package-lock.json"), pj = path.join(dir, "package.json");
  if (!fs.existsSync(pj)) { notes.push(`${dir}: no package.json, skipped`); continue; }
  const pkgText = fs.readFileSync(pj, "utf8");
  const pkg = JSON.parse(pkgText);
  const direct = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const before = npmVersions(lock);
  const saved = fs.existsSync(lock) ? fs.readFileSync(lock) : null;
  // CopilotKit / AG-UI: npm latest, written as an exact version into the CI copy of package.json.
  const want = Object.keys(direct).filter((n) => LATEST_NPM.test(n));
  const lat = await npmLatest(want);
  const pinned = {};
  for (const n of want) {
    const v = lat.get(n);
    if (!v) { notes.push(`${dir}: ${n}: npm latest lookup failed, kept the range ${direct[n]}`); continue; }
    for (const sec of ["dependencies", "devDependencies"]) if (pkg[sec]?.[n]) pkg[sec][n] = v;
    pinned[n] = v;
  }
  const restore = () => { fs.writeFileSync(pj, pkgText); if (saved) fs.writeFileSync(lock, saved); else if (fs.existsSync(lock)) fs.rmSync(lock); };
  try {
    if (Object.keys(pinned).length) fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + "\n");
    if (fs.existsSync(lock)) fs.rmSync(lock);
    run("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", dir);
  } catch (e) {
    restore();
    notes.push(`${dir}: resolve with CopilotKit/AG-UI latest failed, the committed package.json + lockfile are used (${errText(e)})`);
    continue;
  }
  const after = npmVersions(lock);
  fs.mkdirSync(path.join(OUT, "resolved", dir), { recursive: true });
  fs.copyFileSync(lock, path.join(OUT, "resolved", dir, "package-lock.json"));
  fs.copyFileSync(pj, path.join(OUT, "resolved", dir, "package.json"));
  restore(); // the plan checkout keeps the committed files; only resolved/ carries the raised ones
  for (const name of Object.keys(after).sort()) {
    const isDirect = name in direct;
    if (!isDirect && !KEY.test(name)) continue;
    const r = { dir, name, range: direct[name] || "(transitive)", committed: before[name] || null, today: after[name] };
    r.installed = r.today;
    r.direct = isDirect;
    if (pinned[name] && pinned[name] !== direct[name]) r.raised = pinned[name];
    r.changed = r.committed !== r.today;
    rows.push(r);
  }
}
for (const dir of list(args.uv)) {
  const lock = path.join(dir, "uv.lock"), pp = path.join(dir, "pyproject.toml");
  const before = uvVersions(lock);
  const savedLock = fs.existsSync(lock) ? fs.readFileSync(lock) : null;
  const ppText = fs.existsSync(pp) ? fs.readFileSync(pp, "utf8") : "";
  const block = ppText.match(/^dependencies\s*=\s*\[([\s\S]*?)^\]/m)?.[1] ?? "";
  const directPy = new Set([...block.matchAll(/^\s*"([A-Za-z0-9._-]+)/gm)].map((m) => m[1].toLowerCase().replace(/_/g, "-")));
  const raised = {};
  const restore = () => { if (savedLock) fs.writeFileSync(lock, savedLock); if (ppText) fs.writeFileSync(pp, ppText); };
  try {
    run("uv lock --upgrade", dir);
    // A direct copilotkit / ag-ui-* still below PyPI latest: raise its floor (CI copy only) and re-lock.
    const mid = uvVersions(lock);
    const pyLat = await pypiLatest([...directPy].filter((n) => LATEST_PY.test(n)));
    for (const [n, v] of pyLat) if (v && mid[n] && vlt(mid[n], v)) raised[n] = v;
    if (Object.keys(raised).length) {
      let t = ppText;
      for (const [n, v] of Object.entries(raised))
        t = t.replace(new RegExp(`"(${n.replace(/-/g, "[-_]")}(?:\\[[^\\]]*\\])?)\\s*[^"]*"`, "i"), `"$1>=${v}"`);
      fs.writeFileSync(pp, t);
      run("uv lock --upgrade", dir);
    }
  } catch (e) {
    restore();
    notes.push(`${dir}: uv resolve with CopilotKit/AG-UI latest failed, the committed pyproject.toml + uv.lock are used (${errText(e)})`);
    continue;
  }
  const after = uvVersions(lock);
  fs.mkdirSync(path.join(OUT, "resolved", dir), { recursive: true });
  fs.copyFileSync(lock, path.join(OUT, "resolved", dir, "uv.lock"));
  if (Object.keys(raised).length) fs.copyFileSync(pp, path.join(OUT, "resolved", dir, "pyproject.toml"));
  restore();
  for (const name of Object.keys(after).sort()) {
    if (!KEY.test(name) && before[name] === after[name]) continue;
    if (!KEY.test(name) && !(name in before)) continue;
    const r = { dir, name, range: "(pyproject)", committed: before[name] || null, today: after[name], changed: before[name] !== after[name], behind: false };
    r.installed = r.today; r.direct = directPy.has(name);
    if (raised[name]) r.raised = `>=${raised[name]}`;
    rows.push(r);
  }
}

const npmRows = rows.filter((r) => r.range !== "(pyproject)"), pyRows = rows.filter((r) => r.range === "(pyproject)");
const lat = await npmLatest(npmRows.map((r) => r.name));
for (const r of npmRows) { r.latest = lat.get(r.name) || null; r.behind = !!(r.direct && KEY.test(r.name) && r.latest && r.latest !== r.today); }
const plat = await pypiLatest(pyRows.filter((r) => KEY.test(r.name)).map((r) => r.name));
for (const r of pyRows) { r.latest = plat.get(r.name) || null; r.behind = !!(r.latest && LATEST_PY.test(r.name) && vlt(r.today, r.latest)); }
fs.mkdirSync(OUT, { recursive: true });
const isCk = (r) => LATEST_NPM.test(r.name) || LATEST_PY.test(r.name);
const changed = rows.filter((r) => r.changed), behind = rows.filter((r) => r.behind);
const ckBehind = behind.filter(isCk), raisedRows = rows.filter((r) => r.raised);
fs.writeFileSync(path.join(OUT, "versions.json"), JSON.stringify({ resolvedAt: new Date().toISOString(), policy: "@copilotkit/* @ag-ui/* copilotkit ag-ui-*: latest; everything else within its range", changed: changed.length, behind: behind.length, rows, notes }, null, 2));
let md = `## Versions\n\nInstalled: **CopilotKit and AG-UI packages at npm / PyPI latest** (set in the CI copy of package.json / pyproject.toml), everything else re-resolved within its range (the recorder stays locked). `;
md += changed.length ? `**${changed.length} changed since the committed lockfiles.** ` : "No change since the committed lockfiles. ";
if (raisedRows.length) md += `${raisedRows.length} set past the committed range (CI copy only). `;
if (ckBehind.length) md += `**${ckBehind.length} CopilotKit/AG-UI package(s) still behind latest** (held by another package's pin). `;
const otherBehind = behind.length - ckBehind.length;
md += otherBehind ? `${otherBehind} other dependencies behind latest (their range blocks it: a reviewed range bump, DRIFT.md section 4).\n` : "\n";
md += `\n| Project | Package | Committed range | Committed | Installed | Latest |\n|---|---|---|---|---|---|\n`;
// Table: direct deps that changed / are behind, plus every @copilotkit / @ag-ui package and the
// Python key packages; other transitive changes are counted only (full list in versions.json).
const shown = rows.filter((r) => (r.direct || r.range === "(pyproject)" || isCk(r)) && (r.changed || r.behind || isCk(r) || /^google-antigravity$/.test(r.name)));
for (const r of shown)
  md += `| ${r.dir} | ${r.name} | \`${r.range}\`${r.raised ? ` → \`${r.raised}\`` : ""} | ${r.committed || "-"} | ${r.changed ? `**${r.today}**` : r.today} | ${r.latest ? (r.behind ? `**${r.latest}**` : r.latest) : ""} |\n`;
const trans = changed.filter((r) => !shown.includes(r));
if (trans.length) md += `\nAlso changed (not direct): ${trans.length}, e.g. ${trans.slice(0, 6).map((r) => `${r.name} ${r.committed || "-"} → ${r.today}`).join(", ")}. Full list: \`versions.json\`.\n`;
if (notes.length) md += `\n${notes.map((n) => `- ${n}`).join("\n")}\n`;
md += `\nThe CI files are in \`resolved/\` of this run. Commit them (package.json with its lockfile) after the review so tomorrow compares against today.\n`;
fs.writeFileSync(path.join(OUT, "versions.md"), md);
console.log(md);
process.exit(0);
