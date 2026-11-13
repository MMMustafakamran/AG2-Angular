#!/usr/bin/env node
// Doc drift check: what changed in the live docs since doc-snapshot/, and which pages to hold.
// Rules for acting on each kind of change: 2-shared/instructions/DRIFT.md.
//
// CI (plan job, before recording):
//   node .qa/tools/drift.mjs --out=drift [--recorder=recorder-pages.json] [--pages=a,b,c]
//     -> drift/drift.json, drift/drift.md, drift/held.md, drift/keep.txt (pages minus held), drift/live/*
// Local, after the owner decided (updates the snapshot, appends doc-snapshot/CHANGELOG.md):
//   node .qa/tools/drift.mjs --sync                 every tracked page + sidebar + links
//   node .qa/tools/drift.mjs --sync=docPath,docPath those pages only (and their links)
//   node .qa/tools/drift.mjs --sync-nav             sidebar + links baselines only
//
// Compared against the snapshot:
//   pages     doc-snapshot/pages/<root path, "/" -> "_">.md vs <docs>/<path>.md
//             HIGH = code block changed (install command flagged), MEDIUM = headings / callouts /
//             tabs / "not supported" banners, LOW = prose only
//   sidebar   doc-snapshot/sidebar.json vs the live nav tree (from the page's RSC payload)
//   links     doc-snapshot/links.json (in-section links per page) vs the live pages
//   reach     assignment.json `reachable` vs what the live sidebar + links give today
// Held (not recorded): tracked pages with HIGH/MEDIUM drift, LOW drift on a ⚠️/❌ page (the
// highlighted evidence may be prose), gone/moved pages, reachability changes.
// Not held: LOW drift on a ✅ page, fetch errors (drift unknown, recorded on the old snapshot).
// Exit 0 always: drift holds pages, it never fails the run.
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const ORIGIN = (args.base || "https://docs.copilotkit.ai").replace(/\/$/, "");
const SNAP = "doc-snapshot";
const PAGES_DIR = path.join(SNAP, "pages");
const OUT = args.out || "out/drift";
const OUT_OF_SCOPE = /^(intelligence|backend|deploy)(\/|-|$)/; // QA-RULES section 9

const assignment = JSON.parse(fs.readFileSync("assignment.json", "utf8"));
const ROOT = new URL(assignment.docBase).pathname.replace(/^\/|\/$/g, ""); // e.g. vue/langgraph-typescript
const norm = (s) => s.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();
const baseDoc = (p) => (p || "").split("?")[0].replace(/^\/|\/$/g, "");
// A docPath may be a full URL (a page outside ROOT that a reachable page links to, e.g. AG2 Angular -> /ag2/...).
const abs = (doc) => /^https?:\/\//.test(doc || "");
const urlOf = (doc) => abs(doc) ? new URL(doc).pathname.replace(/\/$/, "") : `/${ROOT}${doc ? "/" + doc : ""}`;
const cleanUrl = (u) => u.replace(/\.md$/, "").replace(/\/index$/, "").replace(/\/$/, "");
const docOf = (u) => { u = cleanUrl(u); return u === `/${ROOT}` ? "" : u.startsWith(`/${ROOT}/`) ? u.slice(ROOT.length + 2) : null; };
const fileOf = (doc) => abs(doc) ? `${urlOf(doc).slice(1).replace(/\//g, "_")}.md` : `${(ROOT + (doc ? "/" + doc : "")).replace(/\//g, "_")}.md`;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

// ---------- fetching ----------
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "text/markdown, text/html" }, signal: AbortSignal.timeout(30000) });
      return { status: r.status, text: r.ok ? await r.text() : "", final: new URL(r.url).pathname.replace(/\.md$/, "") };
    } catch (e) {
      if (i === 2) return { status: 0, text: "", error: String(e.message || e) };
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
async function pool(items, n, fn) {
  const out = new Map(), q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const x = q.shift(); out.set(x, await fn(x)); } }));
  return out;
}

// ---------- sidebar (fumadocs page tree inside the RSC payload) ----------
function balanced(s, i) {
  let d = 0, str = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (str) { if (c === "\\") j++; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === "[" || c === "{") d++;
    else if (c === "]" || c === "}") { d--; if (d === 0) return s.slice(i, j + 1); }
  }
  return null;
}
const label = (n) => {
  if (typeof n === "string") return n;
  const s = [];
  (function w(x) { if (typeof x === "string") s.push(x); else if (Array.isArray(x)) x.forEach(w); else if (x && typeof x === "object" && "children" in x) w(x.children); })(n);
  return s.filter((x) => !x.startsWith("$") && x.trim()).pop() ?? "";
};
// root: another docs root whose own sidebar lists a page (assignment page `sidebarRoot`, e.g. each
// /vue/<framework> quickstart sits in its framework's sidebar, not in /vue's). Default: ROOT.
async function liveSidebar(root = ROOT) {
  const r = await get(`${ORIGIN}/${root}`);
  if (r.status !== 200) return { error: r.error || `HTTP ${r.status}` };
  let rsc = "";
  for (const m of r.text.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) { try { rsc += JSON.parse(m[1]); } catch {} }
  let tree = null;
  for (let i = rsc.indexOf('"tree":{'); i >= 0; i = rsc.indexOf('"tree":{', i + 1)) {
    try { const o = JSON.parse(balanced(rsc, i + 7)); if (!tree || JSON.stringify(o).length > JSON.stringify(tree).length) tree = o; } catch {}
  }
  if (!tree) return { error: "nav tree not found in the page payload (docs site markup changed?)" };
  const out = [];
  (function walk(xs, group) {
    for (const x of xs) {
      if (x.type === "separator") group = [label(x.name)];
      else if (x.type === "folder") {
        const g = [...group, label(x.name)];
        if (x.index?.url) out.push({ url: cleanUrl(x.index.url), name: label(x.name), group: g.join(" > ") });
        walk(x.children || [], g);
      } else if (x.type === "page") out.push({ url: cleanUrl(x.url), name: label(x.name), group: group.join(" > ") });
    }
  })(tree.children || [], []);
  const seen = new Set(); // a folder index can also be listed as its first page: keep the first
  return { pages: out.filter((p) => docOf(p.url) !== null && !seen.has(p.url) && seen.add(p.url)) };
}

// ---------- page content ----------
// Code lines: everything inside ``` / ~~~ fences, indented or not (the .md export indents code inside tabs).
function fences(t) {
  const out = []; let cur = null, mark = null;
  for (const l of t.split("\n")) {
    const m = l.match(/^\s*(```+|~~~+)/);
    if (cur === null) { if (m) { cur = [l.trim()]; mark = m[1][0]; } }
    else { cur.push(l.trim()); if (m && m[1][0] === mark && l.trim().replace(/[`~]/g, "") === "") { out.push(cur.join("\n")); cur = null; } }
  }
  if (cur) out.push(cur.join("\n"));
  return out;
}
const structure = (t) => t.split("\n").filter((l) => /^#{1,6}\s|^\s*(>|<Callout|<Tab|<Tabs|<Steps|<Step\b|:::)/.test(l)).join("\n");
const banners = (t) => (t.match(/[^\n]*(not supported|coming soon|deprecated|not available)[^\n]*/gi) || []).join("\n");
const INSTALL = /\b(npm (i|install|add)|pnpm (add|i|install)|yarn add|bun add|npx|pnpm dlx|pip install|uv (add|pip|sync)|poetry add|create-next-app|copilotkit (init|create))\b/;
function lineDiff(a, b) {
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a.split("\n")), cb = count(b.split("\n"));
  let removed = 0, added = 0; const changed = [];
  for (const [l, n] of ca) { const k = Math.max(0, n - (cb.get(l) || 0)); removed += k; if (k) changed.push("- " + l); }
  for (const [l, n] of cb) { const k = Math.max(0, n - (ca.get(l) || 0)); added += k; if (k) changed.push("+ " + l); }
  return { added, removed, changed };
}
function classify(oldT, newT) {
  const kinds = [];
  const fo = fences(oldT), fn = fences(newT);
  if (JSON.stringify(fo) !== JSON.stringify(fn)) {
    kinds.push("code");
    const d = lineDiff(fo.join("\n"), fn.join("\n"));
    if (d.changed.some((l) => INSTALL.test(l))) kinds.push("install");
  }
  if (structure(oldT) !== structure(newT)) kinds.push("structure");
  if (banners(oldT) !== banners(newT)) kinds.push("banner");
  if (!kinds.length) kinds.push("prose");
  const severity = kinds.includes("code") ? "HIGH" : kinds.some((k) => k === "structure" || k === "banner") ? "MEDIUM" : "LOW";
  return { kinds, severity };
}
// In-section links on a page: absolute (/root/x, https://docs.copilotkit.ai/root/x) and relative
// (./x, ../x), the latter resolved against the page's own URL as a browser would.
function links(t, pageUrl) {
  const out = new Set();
  const re = /\]\((?:https?:\/\/docs\.copilotkit\.ai)?((?:\/|\.\.?\/)[^)\s#?]*)|href=["'](?:https?:\/\/docs\.copilotkit\.ai)?((?:\/|\.\.?\/)[^"'#?]*)/g;
  for (const m of t.matchAll(re)) {
    let u = m[1] || m[2];
    if (u.startsWith('.')) {
      if (!pageUrl) continue;
      u = new URL(u, `${ORIGIN}${pageUrl}`).pathname;
    }
    u = cleanUrl(u);
    if (docOf(u) !== null) out.add(u);
  }
  return [...out].sort();
}
function overlap(a, b) {
  const A = new Set(a.split("\n").filter((l) => l.trim().length > 8)), B = new Set(b.split("\n").filter((l) => l.trim().length > 8));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const l of A) if (B.has(l)) n++;
  return n / Math.min(A.size, B.size);
}

// ---------- tracked pages ----------
const tracked = new Map(); // base docPath -> { reachable, status, excluded, ids }
for (const p of assignment.pages) {
  const d = baseDoc(p.docPath);
  const t = tracked.get(d) || { reachable: p.reachable, status: p.status, excluded: !!p.excluded, labels: [], sidebarRoot: p.sidebarRoot || null };
  if (p.reachable === "sidebar" || (p.reachable === "in-content" && t.reachable !== "sidebar")) t.reachable = p.reachable;
  if (!p.excluded) t.excluded = false;
  if (["❌", "⚠️"].includes(p.status)) t.status = p.status;
  t.labels.push(p.label || p.id);
  tracked.set(d, t);
}
const active = (d) => { const t = tracked.get(d); return t && !t.excluded && ["sidebar", "in-content"].includes(t.reachable); };
const inScope = (d) => d !== null && !OUT_OF_SCOPE.test(d);

// ---------- sync mode (local) ----------
async function sync() {
  const today = new Date().toISOString().slice(0, 10);
  const log = [];
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  const only = typeof args.sync === "string" ? args.sync.split(",").map(baseDoc) : null;
  if (args.sync) {
    const docs = only || [...new Set([...tracked.keys(), ...fs.readdirSync(PAGES_DIR).map((f) => docFromFile(f)).filter((d) => d !== null)])].filter(inScope);
    const res = await pool(docs, 6, (d) => get(`${ORIGIN}${urlOf(d)}.md`));
    for (const [d, r] of res) {
      const f = path.join(PAGES_DIR, fileOf(d));
      if (r.status !== 200) { log.push(`- ${d || "(root)"}: live HTTP ${r.status || r.error}, snapshot left as is`); continue; }
      const old = fs.existsSync(f) ? norm(fs.readFileSync(f, "utf8")) : null;
      if (old === norm(r.text)) continue;
      const c = old === null ? { severity: "NEW", kinds: ["new"] } : classify(old, norm(r.text));
      const ld = old === null ? { added: r.text.split("\n").length, removed: 0 } : lineDiff(old, norm(r.text));
      fs.writeFileSync(f, r.text);
      log.push(`- ${d || "(root)"}: ${c.severity} ${c.kinds.join(", ")} (+${ld.added} / -${ld.removed})`);
    }
  }
  if (args.sync === true || args["sync-nav"] || only) {
    const sb = await liveSidebar();
    if (sb.error) log.push(`- sidebar: not read (${sb.error}), baseline left as is`);
    else if (args.sync === true || args["sync-nav"]) {
      const old = readJson(path.join(SNAP, "sidebar.json"), null);
      fs.writeFileSync(path.join(SNAP, "sidebar.json"), JSON.stringify({ root: ROOT, savedAt: today, pages: sb.pages }, null, 1) + "\n");
      if (old) {
        const ou = new Set(old.pages.map((p) => p.url)), nu = new Set(sb.pages.map((p) => p.url));
        const add = sb.pages.filter((p) => !ou.has(p.url)).map((p) => p.url), rem = old.pages.filter((p) => !nu.has(p.url)).map((p) => p.url);
        if (add.length || rem.length) log.push(`- sidebar: added ${add.join(", ") || "none"}; removed ${rem.join(", ") || "none"}`);
      } else log.push(`- sidebar: baseline saved (${sb.pages.length} pages)`);
    }
    const lk = readJson(path.join(SNAP, "links.json"), { pages: {} });
    const from = only ? only.map(urlOf) : [...new Set([...(sb.pages || []).map((p) => p.url), ...[...tracked.keys()].filter(active).map(urlOf)])].filter((u) => inScope(docOf(u)));
    const res = await pool(from, 6, (u) => get(`${ORIGIN}${u}.md`));
    for (const [u, r] of res) if (r.status === 200) lk.pages[u] = links(r.text, u);
    fs.writeFileSync(path.join(SNAP, "links.json"), JSON.stringify({ root: ROOT, savedAt: today, pages: lk.pages }, null, 1) + "\n");
  }
  const cl = path.join(SNAP, "CHANGELOG.md");
  const head = fs.existsSync(cl) ? fs.readFileSync(cl, "utf8") : "# Doc snapshot changelog\n\nWhat each `drift.mjs --sync` took into the snapshot (newest first).\n";
  const [title, ...rest] = head.split("\n\n");
  const entry = `## ${today}${only ? ` (${only.join(", ")})` : args["sync-nav"] ? " (nav)" : ""}\n\n${log.join("\n") || "- no changes"}`;
  if (log.length) fs.writeFileSync(cl, [title, rest[0] || "", entry, ...rest.slice(1)].map((x) => x.trim()).filter(Boolean).join("\n\n") + "\n");
  console.log(entry);
}
function docFromFile(f) {
  const p = f.replace(/\.md$/, "").replace(/_/g, "/");
  return p === ROOT ? "" : p.startsWith(ROOT + "/") ? p.slice(ROOT.length + 1) : null;
}

// ---------- check mode (CI) ----------
async function check() {
  fs.mkdirSync(path.join(OUT, "live"), { recursive: true });
  const report = { checkedAt: new Date().toISOString(), root: ROOT, state: "clean", unknown: [], pages: [], sidebar: {}, reach: [], newPages: [], deadLinks: [], held: [] };

  // 1. pages: every in-scope tracked page + every snapshot page under this root
  const snapDocs = fs.existsSync(PAGES_DIR) ? fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".md")).map(docFromFile).filter((d) => d !== null) : [];
  const docs = [...new Set([...tracked.keys(), ...snapDocs])].filter(inScope).sort();
  const live = await pool(docs, 6, (d) => get(`${ORIGIN}${urlOf(d)}.md`));
  for (const d of docs) {
    const r = live.get(d), f = path.join(PAGES_DIR, fileOf(d));
    const row = { docPath: d, url: `${ORIGIN}${urlOf(d)}`, tracked: tracked.has(d), active: active(d) };
    if (r.status === 404) row.state = "gone";
    else if (r.status !== 200) { row.state = "error"; row.error = r.error || `HTTP ${r.status}`; }
    else if (r.final && r.final !== urlOf(d) && docOf(r.final) !== d) { row.state = "moved"; row.movedTo = r.final; }
    else if (!fs.existsSync(f)) row.state = "no-snapshot";
    else {
      const old = norm(fs.readFileSync(f, "utf8")), now = norm(r.text);
      if (old === now) row.state = "same";
      else {
        Object.assign(row, { state: "changed" }, classify(old, now));
        const ld = lineDiff(old, now); row.added = ld.added; row.removed = ld.removed;
        fs.writeFileSync(path.join(OUT, "live", fileOf(d)), r.text);
        fs.writeFileSync(path.join(OUT, "live", fileOf(d).replace(/\.md$/, ".diff.txt")), ld.changed.join("\n") + "\n");
      }
    }
    report.pages.push(row);
  }

  // 2. sidebar and links (today vs baseline), then reachability
  const sb = await liveSidebar();
  const baseSb = readJson(path.join(SNAP, "sidebar.json"), null);
  const baseLinks = readJson(path.join(SNAP, "links.json"), null);
  let sidebarSet = null, linkSet = null, linksNow = {}, renderedLinks = null, from = [];
  if (sb.error) report.unknown.push(`sidebar: ${sb.error}`);
  else {
    sidebarSet = new Set(sb.pages.map((p) => p.url));
    if (baseSb) {
      const ob = new Map(baseSb.pages.map((p) => [p.url, p]));
      report.sidebar.added = sb.pages.filter((p) => !ob.has(p.url) && inScope(docOf(p.url)));
      report.sidebar.removed = baseSb.pages.filter((p) => !sidebarSet.has(p.url) && inScope(docOf(p.url)));
      report.sidebar.renamed = sb.pages.filter((p) => inScope(docOf(p.url)) && ob.has(p.url) && (ob.get(p.url).name !== p.name || ob.get(p.url).group !== p.group))
        .map((p) => ({ url: p.url, from: `${ob.get(p.url).group} > ${ob.get(p.url).name}`, to: `${p.group} > ${p.name}` }));
    } else report.unknown.push("sidebar: no baseline (doc-snapshot/sidebar.json); run drift.mjs --sync-nav locally");
    // links from every in-scope sidebar page (one hop = in-content, QA-RULES section 9)
    from = sb.pages.map((p) => p.url).filter((u) => inScope(docOf(u)));
    const got = await pool(from, 6, (u) => (live.has(docOf(u)) ? live.get(docOf(u)) : get(`${ORIGIN}${u}.md`)));
    linkSet = new Set();
    for (const [u, r] of got) if (r.status === 200) { linksNow[u] = links(r.text, u); linksNow[u].forEach((x) => linkSet.add(x)); }
    fs.writeFileSync(path.join(OUT, "live", "sidebar.json"), JSON.stringify({ root: ROOT, pages: sb.pages }, null, 1));
    fs.writeFileSync(path.join(OUT, "live", "links.json"), JSON.stringify({ root: ROOT, pages: linksNow }, null, 1));
  }
  if (sidebarSet) {
    for (const [d, t] of tracked) {
      if (!inScope(d)) continue;
      const u = urlOf(d), row = report.pages.find((p) => p.docPath === d);
      let inSb = sidebarSet.has(u);
      if (!inSb && t.sidebarRoot && t.sidebarRoot !== ROOT) {
        const own = await liveSidebar(t.sidebarRoot);
        if (own.error) report.unknown.push(`sidebar of ${t.sidebarRoot}: ${own.error}`);
        inSb = !own.error && own.pages.some((p) => p.url === u);
        if (own.error && (t.reachable || "none") === "sidebar") inSb = true; // unknown, not removed
      }
      // Pages outside ROOT (full-URL docPath) are reached through out-of-section links the link scan
      // never follows: keep their recorded reachability unless the page is gone.
      if (abs(d) && row?.state !== "gone") continue;
      let now = row?.state === "gone" ? "gone" : inSb ? "sidebar" : linkSet.has(u) ? "in-content" : "none";
      if (now !== "gone" && now !== (t.reachable || "none") && now !== "sidebar") {
        // The rendered page can redirect where the .md export doesn't (e.g. /vue/<fw>/quickstart
        // -> /vue/<fw>, the sidebar's "Quickstart"): a reader lands on the redirect target.
        const h = await get(`${ORIGIN}${u}`);
        const to = h.final && cleanUrl(h.final);
        if (to && to !== u) {
          row && (row.redirectsTo = to);
          if (sidebarSet.has(to)) now = "sidebar"; else if (linkSet.has(to) && now === "none") now = "in-content";
        }
      }
      if (now === "none" && (t.reachable || "none") !== "none") {
        // Cards and buttons on the rendered page (e.g. the quickstart's "Read the docs" cards) never
        // appear in the .md export: before calling a page unlinked, check the rendered HTML of the
        // in-scope sidebar pages too (fetched once, only when needed).
        if (!renderedLinks) {
          renderedLinks = new Set();
          const html = await pool(from, 6, (x) => get(`${ORIGIN}${x}`));
          for (const [x, r] of html) if (r.status === 200) links(r.text, x).forEach((y) => renderedLinks.add(y));
        }
        if (renderedLinks.has(u)) now = "in-content";
      }
      const was = t.reachable || "none";
      if (now !== was) report.reach.push({ docPath: d, from: was, to: now, active: active(d) });
    }
    // new pages: reachable today, untracked, not in the baseline either (baseline = known and decided)
    const knownSb = new Set((baseSb?.pages || []).map((p) => p.url));
    const knownLinks = new Set(Object.values(baseLinks?.pages || {}).flat());
    const cands = new Map();
    for (const p of sb.pages) if (!tracked.has(docOf(p.url)) && inScope(docOf(p.url)) && baseSb && !knownSb.has(p.url)) cands.set(p.url, `sidebar: ${p.group} > ${p.name}`);
    for (const [fromU, ls] of Object.entries(linksNow))
      for (const u of ls)
        if (!sidebarSet.has(u) && !tracked.has(docOf(u)) && inScope(docOf(u)) && baseLinks && !knownLinks.has(u) && !cands.has(u)) cands.set(u, `linked from ${fromU}`);
    const chk = await pool([...cands.keys()], 6, (u) => get(`${ORIGIN}${u}.md`));
    for (const [u, how] of cands) {
      const r = chk.get(u);
      if (r.status === 200) report.newPages.push({ url: `${ORIGIN}${u}`, docPath: docOf(u), how, text: r.text });
      else if (r.status === 404) report.deadLinks.push({ url: `${ORIGIN}${u}`, how });
    }
    // dead links on tracked pages (in-section targets that 404)
    const targets = [...new Set(report.pages.filter((p) => p.active).flatMap((p) => linksNow[urlOf(p.docPath)] || []))]
      .filter((u) => !sidebarSet.has(u) && !cands.has(u));
    const tg = await pool(targets, 6, (u) => (live.has(docOf(u)) ? live.get(docOf(u)) : get(`${ORIGIN}${u}.md`)));
    for (const [u, r] of tg) if (r.status === 404) {
      const by = Object.entries(linksNow).filter(([, ls]) => ls.includes(u)).map(([f]) => f);
      report.deadLinks.push({ url: `${ORIGIN}${u}`, how: `linked from ${by.join(", ")}` });
    }
  }
  // renamed: a gone page whose old content shows up under a new page
  for (const row of report.pages.filter((p) => p.state === "gone" && p.tracked)) {
    const f = path.join(PAGES_DIR, fileOf(row.docPath));
    if (!fs.existsSync(f)) continue;
    const old = norm(fs.readFileSync(f, "utf8"));
    const best = report.newPages.map((n) => ({ n, s: overlap(old, norm(n.text)) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.5) row.renamedTo = best.n.url;
  }
  report.newPages.forEach((n) => delete n.text);
  report.pages.filter((p) => p.state === "error").forEach((p) => report.unknown.push(`${p.docPath}: ${p.error}`));

  // 3. held = tracked, recorded pages that must not be filmed until the change is reviewed
  const why = new Map();
  const hold = (d, r) => { if (active(d)) why.set(d, [...(why.get(d) || []), r]); };
  for (const p of report.pages) {
    if (p.state === "changed") {
      const failing = ["❌", "⚠️"].includes(tracked.get(p.docPath)?.status);
      if (p.severity !== "LOW" || failing) hold(p.docPath, `${p.severity} ${p.kinds.join(", ")} (+${p.added} / -${p.removed})${p.severity === "LOW" ? `: prose on a ${tracked.get(p.docPath).status} page` : ""}`);
    } else if (p.state === "gone") hold(p.docPath, `page gone (404)${p.renamedTo ? `, probably renamed to ${p.renamedTo}` : ""}`);
    else if (p.state === "moved") hold(p.docPath, `redirects to ${p.movedTo}`);
  }
  for (const r of report.reach) if (r.to !== "gone") hold(r.docPath, `reachable ${r.from} -> ${r.to}`);
  const rec = args.recorder ? readJson(args.recorder, []) : [];
  for (const [d, reasons] of why) {
    const ids = rec.filter((r) => baseDoc(r.docPath) === d).map((r) => r.id);
    report.held.push({ docPath: d, ids, reasons, labels: tracked.get(d)?.labels || [] });
  }
  const heldIds = new Set(report.held.flatMap((h) => h.ids));
  if (args.pages !== undefined) {
    const pages = String(args.pages === true ? "" : args.pages).split(",").map((s) => s.trim()).filter(Boolean);
    fs.writeFileSync(path.join(OUT, "keep.txt"), pages.filter((p) => !heldIds.has(p)).join(","));
  }
  const anyDrift = report.pages.some((p) => !["same", "error", "no-snapshot"].includes(p.state)) || report.reach.length || report.newPages.length
    || (report.sidebar.added || []).length || (report.sidebar.removed || []).length;
  report.state = anyDrift ? "drift" : report.unknown.length ? "unknown" : "clean";
  fs.writeFileSync(path.join(OUT, "drift.json"), JSON.stringify(report, null, 2));

  // 4. markdown
  const by = (s) => report.pages.filter((p) => p.state === s);
  let md = `## Doc drift\n\n**${report.state === "clean" ? "Clean." : report.state === "unknown" ? "Unknown, not absent:" : "Drift."}** `;
  md += `${report.pages.length} pages under /${ROOT}: ${by("same").length} same, ${by("changed").length} changed, ${by("gone").length} gone, ${by("moved").length} moved, ${by("error").length} unreadable, ${by("no-snapshot").length} without a snapshot.\n`;
  if (report.held.length) {
    md += `\n### Held: not recorded today (${report.held.length} pages, ${heldIds.size} recorder ids)\n\nReview each change (DRIFT.md), update the harness, then \`drift.mjs --sync=<docPath>\` and rerun those pages.\n\n| Page | Recorder ids | Why |\n|---|---|---|\n`;
    for (const h of report.held) md += `| [${h.docPath || "(root)"}](${ORIGIN}${urlOf(h.docPath)}) | ${h.ids.join(", ") || "-"} | ${h.reasons.join("; ")} |\n`;
  }
  const other = report.pages.filter((p) => !["same"].includes(p.state) && !why.has(p.docPath));
  if (other.length) {
    md += `\n### Changed, recorded anyway\n\n| Page | State | Detail |\n|---|---|---|\n`;
    for (const p of other) md += `| [${p.docPath || "(root)"}](${p.url}) | ${p.state}${p.tracked ? "" : " (untracked)"} | ${p.state === "changed" ? `${p.severity} ${p.kinds.join(", ")} (+${p.added} / -${p.removed})` : p.error || p.movedTo || p.renamedTo || ""} |\n`;
  }
  if (report.reach.length) { md += `\n### Reachability changed\n\n`; for (const r of report.reach) md += `- ${r.docPath || "(root)"}: ${r.from} -> ${r.to}${r.active ? "" : " (not recorded)"}\n`; }
  if (report.newPages.length) { md += `\n### New pages to decide\n\n`; for (const n of report.newPages) md += `- [${n.docPath}](${n.url}): ${n.how}\n`; }
  const sbc = report.sidebar;
  if ((sbc.added || []).length || (sbc.removed || []).length || (sbc.renamed || []).length) {
    md += `\n### Sidebar vs baseline\n\n`;
    for (const p of sbc.added || []) md += `- added: ${p.group} > ${p.name} (${p.url})${tracked.has(docOf(p.url)) ? "" : " (untracked)"}\n`;
    for (const p of sbc.removed || []) md += `- removed: ${p.group} > ${p.name} (${p.url})\n`;
    for (const p of sbc.renamed || []) md += `- renamed/moved: ${p.from} -> ${p.to}\n`;
  }
  if (report.deadLinks.length) { md += `\n### Dead links\n\n`; for (const l of report.deadLinks) md += `- ${l.url}: ${l.how}\n`; }
  if (report.unknown.length) { md += `\n### Not checked (drift unknown, not absent)\n\n`; for (const u of report.unknown) md += `- ${u}\n`; }
  md += `\nLive copies and line diffs of changed pages: \`drift/live/\`. CI never updates the snapshot.\n`;
  fs.writeFileSync(path.join(OUT, "drift.md"), md);
  fs.writeFileSync(path.join(OUT, "held.md"), report.held.length ? md.slice(md.indexOf("### Held"), md.indexOf("\n### ", md.indexOf("### Held") + 5) > 0 ? md.indexOf("\n### ", md.indexOf("### Held") + 5) : undefined) : "No pages held.\n");
  console.log(md);
}

if (args.sync || args["sync-nav"]) await sync();
else await check();
process.exit(0);
