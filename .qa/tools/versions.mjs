#!/usr/bin/env node
// Install what a new reader gets today (CI plan job, before recording).
// Re-resolves each project's lockfile within the ranges package.json / pyproject.toml already allow
// (a reader running the doc's `npm install @copilotkit/...` today gets the newest 1.x; so does `^1.84.1`).
// Never rewrites a range: raising one (a new major, a 0.0.x caret, an exact pin from a scaffold) is a
// reviewed edit, flagged here as "behind latest". The recorder's own deps stay locked (harness tool).
//
//   node .qa/tools/versions.mjs --npm=frontend,agent [--uv=backend] --out=plan-out
//     -> <out>/resolved/<dir>/package-lock.json | uv.lock   (fresh lockfiles, copied back by each shard)
//        <out>/versions.json, <out>/versions.md              (committed lock vs today vs npm latest)
// Exit 0 always; a dir that fails to resolve keeps its committed lockfile (said in versions.md).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const list = (s) => (typeof s === "string" ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
const OUT = args.out || "plan-out";
// Always listed (direct deps are listed only when they changed or are behind latest).
const KEY = /^(@copilotkit\/|@ag-ui\/|@langchain\/|@a2ui|@hashbrownai\/|@json-render\/|next$|react$|vue$|langchain$|copilotkit$|ag-ui|google-antigravity$|google-adk$|langgraph$)/;
// npm 12 refuses remote tarball deps by default (tailwind's wasm package uses one); older npm ignores the setting.
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
for (const dir of list(args.npm)) {
  const lock = path.join(dir, "package-lock.json");
  if (!fs.existsSync(path.join(dir, "package.json"))) { notes.push(`${dir}: no package.json, skipped`); continue; }
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const direct = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const before = npmVersions(lock);
  const saved = fs.existsSync(lock) ? fs.readFileSync(lock) : null;
  try {
    if (fs.existsSync(lock)) fs.rmSync(lock);
    run("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", dir);
  } catch (e) {
    if (saved) fs.writeFileSync(lock, saved);
    notes.push(`${dir}: re-resolve failed, the committed lockfile is used (${String(e.stderr || e.message).split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 200)})`);
    continue;
  }
  const after = npmVersions(lock);
  fs.mkdirSync(path.join(OUT, "resolved", dir), { recursive: true });
  fs.copyFileSync(lock, path.join(OUT, "resolved", dir, "package-lock.json"));
  for (const name of Object.keys(after).sort()) {
    const isDirect = name in direct;
    if (!isDirect && !KEY.test(name)) continue;
    const r = { dir, name, range: direct[name] || "(transitive)", committed: before[name] || null, today: after[name] };
    r.direct = isDirect;
    r.changed = r.committed !== r.today;
    rows.push(r);
  }
}
for (const dir of list(args.uv)) {
  const lock = path.join(dir, "uv.lock");
  const before = uvVersions(lock);
  try { run("uv lock --upgrade", dir); } catch (e) {
    notes.push(`${dir}: uv lock --upgrade failed, the committed uv.lock is used (${String(e.stderr || e.message).split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 200)})`);
    continue;
  }
  const after = uvVersions(lock);
  fs.mkdirSync(path.join(OUT, "resolved", dir), { recursive: true });
  fs.copyFileSync(lock, path.join(OUT, "resolved", dir, "uv.lock"));
  for (const name of Object.keys(after).sort()) {
    if (!KEY.test(name) && before[name] === after[name]) continue;
    if (!KEY.test(name) && !(name in before)) continue;
    rows.push({ dir, name, range: "(pyproject)", committed: before[name] || null, today: after[name], changed: before[name] !== after[name], behind: false });
  }
}

const npmRows = rows.filter((r) => r.range !== "(pyproject)");
const lat = await npmLatest(npmRows.map((r) => r.name));
for (const r of npmRows) { r.latest = lat.get(r.name) || null; r.behind = !!(r.direct && KEY.test(r.name) && r.latest && r.latest !== r.today); }
fs.mkdirSync(OUT, { recursive: true });
const changed = rows.filter((r) => r.changed), behind = rows.filter((r) => r.behind);
fs.writeFileSync(path.join(OUT, "versions.json"), JSON.stringify({ resolvedAt: new Date().toISOString(), changed: changed.length, behind: behind.length, rows, notes }, null, 2));
let md = `## Versions\n\nInstalled what a new reader gets today: lockfiles re-resolved within the ranges in package.json / pyproject.toml (the recorder stays locked). `;
md += changed.length ? `**${changed.length} changed since the committed lockfiles.** ` : "No change since the committed lockfiles. ";
md += behind.length ? `**${behind.length} behind npm latest** (the range blocks it: a reviewed range bump, DRIFT.md section 4).\n` : "\n";
md += `\n| Project | Package | Range | Committed | Today | npm latest |\n|---|---|---|---|---|---|\n`;
// Table: direct deps that changed / are behind, plus every direct @copilotkit package (and the
// Python key packages); transitive changes are counted only (full list in versions.json).
const shown = rows.filter((r) => (r.direct || r.range === "(pyproject)") && (r.changed || r.behind || /^(@copilotkit\/|copilotkit$|ag-ui|google-antigravity$)/.test(r.name)));
for (const r of shown)
  md += `| ${r.dir} | ${r.name} | \`${r.range}\` | ${r.committed || "-"} | ${r.changed ? `**${r.today}**` : r.today} | ${r.latest ? (r.behind ? `**${r.latest}**` : r.latest) : ""} |\n`;
const trans = changed.filter((r) => !shown.includes(r));
if (trans.length) md += `\nAlso changed (not direct): ${trans.length}, e.g. ${trans.slice(0, 6).map((r) => `${r.name} ${r.committed || "-"} → ${r.today}`).join(", ")}. Full list: \`versions.json\`.\n`;
if (notes.length) md += `\n${notes.map((n) => `- ${n}`).join("\n")}\n`;
md += `\nThe fresh lockfiles are in \`resolved/\` of this run. Commit them after the review so tomorrow compares against today.\n`;
fs.writeFileSync(path.join(OUT, "versions.md"), md);
console.log(md);
process.exit(0);
