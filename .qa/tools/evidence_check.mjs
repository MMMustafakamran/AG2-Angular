#!/usr/bin/env node
// Evidence check (CI plan job, after drift): is every FINDING_EVIDENCE `text` still on the live doc page?
// A finding clip whose highlight text is gone films a skipped drag-select, so such pages are held.
//
//   node .qa/tools/evidence_check.mjs --pages=a,b,c [--out=plan-out] [--summary=$GITHUB_STEP_SUMMARY]
//     -> <out>/evidence.json  {page: [missing texts]}  (pages with no evidence or all found are absent)
//     -> <out>/evidence-keep.txt  pages minus those with missing evidence
//     -> markdown table appended to --summary
//   node .qa/tools/evidence_check.mjs --dump=meta.json
//   --evidence=test.json  ({page: [texts]}) replaces the table, to test the matcher
//     -> every recorder page {id, filename, docUrl, demoMayError, docOnlyAction, evidence} (used by gate.py)
//
// Run from the repo root. The evidence table is the `FINDING_EVIDENCE` export of
// autorecorder/actions/*.ts (page id -> [{ text, caption, clickTab? }]), read with tsx.
// Never blocks a run: on a tool fault or a fetch error it warns, writes no hold for that page, exits 0.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const REC = args.recorder || "autorecorder";
const warn = (m) => console.log(`::warning::evidence check: ${m}`);

function loadMeta() {
  const files = fs.readdirSync(path.join(REC, "actions")).filter((f) => f.endsWith(".ts"));
  const recAbs = path.resolve(REC);
  const url = (f) => JSON.stringify(pathToFileURL(path.join(recAbs, f)).href);
  const tmp = path.resolve(args.dump && args.dump !== true ? args.dump : path.join(args.out || "plan-out", "evidence-meta.json"));
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  const script = `import fs from 'node:fs';
const cfg = await import(${url("config/pages.config.ts")});
let ev = {};
for (const f of [${files.map((f) => url("actions/" + f)).join(",")}]) {
  try { const m = await import(f); if (m.FINDING_EVIDENCE) ev = { ...ev, ...m.FINDING_EVIDENCE }; } catch (e) { console.error('skip ' + f + ': ' + e.message); }
}
const out = cfg.PAGES.map((p) => ({ id: p.id, filename: p.filename, docUrl: p.docUrl,
  demoMayError: !!p.demoMayError, docOnlyAction: !!p.docOnlyAction, evidence: ev[p.id] || [] }));
fs.writeFileSync(${JSON.stringify(tmp)}, JSON.stringify(out));
process.exit(0);
`;
  const sf = path.join(os.tmpdir(), `evidence-meta-${process.pid}.mts`);
  fs.writeFileSync(sf, script);
  try {
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", sf], {
      cwd: recAbs, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32", timeout: 120000,
    });
  } finally { fs.rmSync(sf, { force: true }); }
  return JSON.parse(fs.readFileSync(tmp, "utf8"));
}

// ---------- normalising (the browser shows decoded text; the HTML has entities, tags and the RSC payload) ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#x2F": "/", "#47": "/" };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (ENT[e] !== undefined) return ENT[e];
    if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (/^#\d/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return m;
  });
const unescapeJs = (s) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "").replace(/\\(["'\\/])/g, "$1");
const collapse = (s) => s.replace(/[\s\u00a0\u200b]+/g, " ").trim();
const squash = (s) => s.replace(/[\s\u00a0\u200b]+/g, "");

// Only the server-rendered markup counts: the RSC payload in <script> tags also carries code the reader
// never sees (other demos' sources, hidden files), so matching it gives false "found".
// Code inside the markup can still be JS-escaped (inline JSON props), hence the unescaped forms too.
function haystacks(html) {
  const out = new Set();
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const forms = [html];
  let u = html;
  for (let i = 0; i < 3; i++) { u = unescapeJs(u); forms.push(u); }
  for (const f of forms) {
    out.add(f);
    out.add(decodeEntities(f));
    out.add(decodeEntities(f.replace(/<[^>]*>/g, "")));       // tags splitting tokens (highlighted code)
    out.add(decodeEntities(f.replace(/<[^>]*>/g, " ")));
  }
  return [...out].map((h) => ({ c: collapse(h), s: squash(h) }));
}
function found(text, hs) {
  const variants = new Set([text, decodeEntities(text), unescapeJs(text)]);
  for (const v of variants) {
    const c = collapse(v), s = squash(v);
    if (!s) return true;
    if (hs.some((h) => h.c.includes(c) || h.s.includes(s))) return true;
  }
  return false;
}

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "text/html" }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.text();
      if (r.status === 404) throw new Error("404");
    } catch (e) { if (i === 2 || String(e.message) === "404") throw e; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("fetch failed");
}

async function main() {
  const meta = loadMeta();
  if (typeof args.evidence === "string") {   // test hook: {page: [texts]} replaces the actions' table
    const t = JSON.parse(fs.readFileSync(args.evidence, "utf8"));
    for (const p of meta) p.evidence = (t[p.id] || []).map((text) => ({ text }));
  }
  if (args.dump) { console.log(`wrote ${args.dump} (${meta.length} pages)`); return; }
  const OUT = args.out || "plan-out";
  fs.mkdirSync(OUT, { recursive: true });
  const want = typeof args.pages === "string" ? args.pages.split(",").map((s) => s.trim()).filter(Boolean) : meta.map((p) => p.id);
  const byId = Object.fromEntries(meta.map((p) => [p.id, p]));
  const missing = {}, rows = [], errors = [];
  for (const id of want) {
    const p = byId[id];
    if (!p || !p.evidence.length) continue;
    let hs;
    try { hs = haystacks(await get(p.docUrl.split("#")[0])); }
    catch (e) { errors.push(id); warn(`${id}: could not fetch ${p.docUrl} (${e.message}); recording anyway`); continue; }
    for (const ev of p.evidence) {
      const ok = found(ev.text, hs);
      rows.push({ id, ok, text: ev.text });
      if (!ok) (missing[id] ||= []).push(ev.text);
    }
  }
  fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(missing, null, 2));
  const keep = want.filter((id) => !missing[id]);
  fs.writeFileSync(path.join(OUT, "evidence-keep.txt"), keep.join(","));
  const esc = (s) => s.replace(/\|/g, "\\|").replace(/`/g, "'");
  let md = `### Evidence check (FINDING_EVIDENCE vs the live doc page)\n\n${rows.length} texts on ${new Set(rows.map((r) => r.id)).size} pages, ${rows.filter((r) => !r.ok).length} missing${errors.length ? `, fetch failed (recorded anyway): ${errors.join(", ")}` : ""}.\n\n`;
  if (Object.keys(missing).length) {
    md += `**Held: evidence not on the live page** (not recorded; update FINDING_EVIDENCE or the finding)\n\n| Page | Missing text |\n|---|---|\n`;
    for (const [id, ts] of Object.entries(missing)) for (const t of ts) md += `| ${id} | \`${esc(t)}\` |\n`;
  }
  if (args.summary && args.summary !== true) fs.appendFileSync(args.summary, md + "\n");
  console.log(md);
}

main().catch((e) => { warn(`tool crashed (${String(e.message || e).slice(0, 200)}); recording every page`); process.exit(0); });
