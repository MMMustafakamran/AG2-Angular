import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as crypto from 'node:crypto';

const DOCS_ROOT = 'https://docs.copilotkit.ai/angular/ag2';
const BASE_URL = 'https://docs.copilotkit.ai';

const DOC_PAGES = [
  { docPath: '/angular/ag2', routes: ['/'] },
  { docPath: '/angular/ag2/quickstart', routes: ['/quickstart'] },
  { docPath: '/angular/ag2/guides/chat-ui', routes: ['/chat-ui'] },
  { docPath: '/angular/ag2/guides/frontend-tools-generative-ui', routes: ['/frontend-tools-generative-ui'] },
  { docPath: '/angular/ag2/guides/a2ui', routes: ['/a2ui'] },
  { docPath: '/angular/ag2/guides/voice-multimodal', routes: ['/voice-multimodal'] },
  { docPath: '/angular/ag2/guides/human-in-the-loop', routes: ['/human-in-the-loop'] },
  { docPath: '/angular/ag2/guides/shared-state', routes: ['/shared-state'] },
  {
    docPath: '/angular/ag2/guides/threads-memory-attachments-headless',
    routes: ['/threads', '/memory', '/attachments', '/headless'],
  },
  // Tracked late. The quickstart's closing step has always linked here
  // ("More detail: Inspector"), but the page was in neither DOC_PAGES nor the
  // manifest -- so drift had never once looked at it. That is the first item on
  // project-context.md's list of gaps the pipeline misses: a page with no entry
  // produces no diff and no failure, so nothing ever said it was untested.
  { docPath: '/angular/ag2/inspector', routes: ['/inspector'] },
];

function fetchText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 200, body: data }));
      })
      .on('error', (err) => resolve({ status: 500, body: err.message }));
  });
}

function docPathToFilename(docPath: string): string {
  return docPath.replace(/^\//, '').replace(/\//g, '__') + '.md';
}

function extractTitle(body: string, defaultTitle: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim();
  }
  return defaultTitle;
}

interface DiffLine {
  op: 'context' | 'add' | 'remove';
  text: string;
  kind: 'prose' | 'heading' | 'code' | 'fence-open' | 'fence-close';
}

interface DiffHunk {
  startLine: number;
  heading?: string;
  lines: DiffLine[];
}

function classifyLine(text: string, inCodeFence: boolean): { kind: DiffLine['kind']; inCodeFence: boolean } {
  if (text.startsWith('```')) {
    return { kind: inCodeFence ? 'fence-close' : 'fence-open', inCodeFence: !inCodeFence };
  }
  if (inCodeFence) {
    return { kind: 'code', inCodeFence: true };
  }
  if (text.startsWith('#')) {
    return { kind: 'heading', inCodeFence: false };
  }
  return { kind: 'prose', inCodeFence: false };
}

// LCS-based line diffing
function computeDiff(oldText: string, newText: string): DiffHunk[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diffOps: { op: 'context' | 'add' | 'remove'; text: string; oldIdx: number; newIdx: number }[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffOps.unshift({ op: 'context', text: oldLines[i - 1], oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffOps.unshift({ op: 'add', text: newLines[j - 1], oldIdx: -1, newIdx: j - 1 });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffOps.unshift({ op: 'remove', text: oldLines[i - 1], oldIdx: i - 1, newIdx: -1 });
      i--;
    }
  }

  const hunks: DiffHunk[] = [];
  let currentHunk: DiffLine[] = [];
  let hunkStart = 0;
  let currentHeading = '';
  let inCode = false;

  for (let idx = 0; idx < diffOps.length; idx++) {
    const item = diffOps[idx];
    if (item.text.startsWith('#')) {
      currentHeading = item.text.replace(/^#+\s*/, '').trim();
    }

    if (item.op !== 'context') {
      if (currentHunk.length === 0) {
        hunkStart = item.newIdx >= 0 ? item.newIdx + 1 : item.oldIdx + 1;
        // Include up to 2 preceding context lines
        for (let c = Math.max(0, idx - 2); c < idx; c++) {
          const ctxItem = diffOps[c];
          const { kind, inCodeFence } = classifyLine(ctxItem.text, inCode);
          inCode = inCodeFence;
          currentHunk.push({ op: 'context', text: ctxItem.text, kind });
        }
      }
      const { kind, inCodeFence } = classifyLine(item.text, inCode);
      inCode = inCodeFence;
      currentHunk.push({ op: item.op, text: item.text, kind });
    } else if (currentHunk.length > 0) {
      const { kind, inCodeFence } = classifyLine(item.text, inCode);
      inCode = inCodeFence;
      currentHunk.push({ op: 'context', text: item.text, kind });

      const nextChanges = diffOps.slice(idx + 1, idx + 4).some((x) => x.op !== 'context');
      if (!nextChanges) {
        hunks.push({ startLine: hunkStart, heading: currentHeading || undefined, lines: currentHunk });
        currentHunk = [];
      }
    }
  }

  if (currentHunk.length > 0) {
    hunks.push({ startLine: hunkStart, heading: currentHeading || undefined, lines: currentHunk });
  }

  return hunks;
}

async function run() {
  const isCheckOnly = process.argv.includes('--check');
  console.log(`\n🔍 Checking AG2 Python (Angular) docs against ${DOCS_ROOT}...\n`);

  const now = new Date();
  const isoTimestamp = now.toISOString();
  const timestampFilePart = isoTimestamp.replace(/:/g, '-').replace(/\./g, '-');
  const httpDate = now.toUTCString();

  const repoRoot = path.resolve(__dirname, '../..');
  const snapshotDir = path.join(repoRoot, 'doc-snapshot');
  const pagesDir = path.join(snapshotDir, 'pages');
  const reportsDir = path.join(snapshotDir, 'reports');
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  const changelogPath = path.join(snapshotDir, 'CHANGELOG.md');

  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  let existingManifest: { pages?: Record<string, any>; sitemap?: { knownUnmapped?: string[] } } = {};
  if (fs.existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      existingManifest = {};
    }
  }

  const manifestPages: Record<string, any> = {};
  const reportPages: any[] = [];
  const changedPages: {
    docPath: string;
    routes: string[];
    title: string;
    severity: 'high' | 'medium' | 'low';
    codeLines: number;
    proseLines: number;
    hunks: DiffHunk[];
  }[] = [];

  for (const pageDef of DOC_PAGES) {
    const mdUrl = `${BASE_URL}${pageDef.docPath}.md`;
    const res = await fetchText(mdUrl);

    if (res.status !== 200 || res.body.startsWith('<!DOCTYPE') || res.body.startsWith('<html')) {
      console.warn(`⚠️ Could not fetch ${mdUrl} (HTTP ${res.status})`);
      continue;
    }

    const liveContent = res.body;
    const liveSha256 = crypto.createHash('sha256').update(liveContent, 'utf8').digest('hex');
    const bytes = Buffer.byteLength(liveContent, 'utf8');
    const lines = liveContent.split('\n').length;
    const filename = docPathToFilename(pageDef.docPath);
    const filePath = path.join(pagesDir, filename);
    const title = extractTitle(liveContent, pageDef.docPath);

    const prevMeta = existingManifest.pages?.[pageDef.docPath];
    const prevSha256 = prevMeta?.sha256 || null;
    let localContent = '';

    if (fs.existsSync(filePath)) {
      localContent = fs.readFileSync(filePath, 'utf8');
    }

    const hasChanged = localContent !== '' && localContent !== liveContent;

    manifestPages[pageDef.docPath] = {
      file: filename,
      sha256: liveSha256,
      bytes,
      lines,
      routes: pageDef.routes,
      status: 'ok',
      age: 0,
      date: httpDate,
    };

    if (!hasChanged) {
      reportPages.push({
        docPath: pageDef.docPath,
        url: mdUrl,
        routes: pageDef.routes,
        title,
        sha256: liveSha256,
        bytes,
        lines,
        outcome: 'unchanged',
        severity: 'none',
        hunks: [],
      });
      if (!fs.existsSync(filePath) && !isCheckOnly) {
        fs.writeFileSync(filePath, liveContent, 'utf8');
      }
    } else {
      const hunks = computeDiff(localContent, liveContent);
      let codeLines = 0;
      let proseLines = 0;
      for (const hunk of hunks) {
        for (const l of hunk.lines) {
          if (l.op !== 'context') {
            if (l.kind === 'code' || l.kind === 'fence-open' || l.kind === 'fence-close') {
              codeLines++;
            } else {
              proseLines++;
            }
          }
        }
      }

      const severity: 'high' | 'medium' | 'low' = codeLines > 0 ? 'high' : proseLines > 10 ? 'medium' : 'low';

      changedPages.push({
        docPath: pageDef.docPath,
        routes: pageDef.routes,
        title,
        severity,
        codeLines,
        proseLines,
        hunks,
      });

      reportPages.push({
        docPath: pageDef.docPath,
        url: mdUrl,
        routes: pageDef.routes,
        title,
        sha256: liveSha256,
        bytes,
        lines,
        outcome: 'modified',
        severity,
        hunks,
      });

      if (!isCheckOnly) {
        fs.writeFileSync(filePath, liveContent, 'utf8');
      }
    }
  }

  // Sitemap: the pages upstream lists under this repo's docs root. The drift
  // gate (ci/check-doc-drift.mjs `checkSitemapGaps`) compares the same set
  // against `pages` + `sitemap.knownUnmapped` and exits 2 on anything new.
  // Modelled on Agno-angular's sync-docs.ts, with two differences: the prefix
  // is the framework root (`/angular/ag2/`), not every `/angular/` URL, and
  // `knownUnmapped` is carried over from the existing manifest rather than
  // re-seeded from whatever is unmapped today -- re-seeding would acknowledge
  // every new page the moment it appeared, which is exactly what the gate is
  // there to catch. Acknowledge a page by adding it to the manifest by hand.
  const sitemapRes = await fetchText(`${BASE_URL}/sitemap.xml`);
  const sitemapUrls =
    sitemapRes.status === 200
      ? [...sitemapRes.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1].trim())
      : [];
  const rootPrefix = `${DOCS_ROOT.replace(/\/+$/, '')}/`;
  // The section root itself is listed without the trailing slash.
  const urlsUnderRoot = sitemapUrls.filter((url) => url.startsWith(rootPrefix) || url === DOCS_ROOT);
  const mappedUrls = new Set(DOC_PAGES.map((p) => `${BASE_URL}${p.docPath}`));
  const knownUnmapped: string[] = Array.isArray(existingManifest.sitemap?.knownUnmapped)
    ? existingManifest.sitemap.knownUnmapped
    : [];
  const newUnmapped = urlsUnderRoot.filter((url) => !mappedUrls.has(url) && !knownUnmapped.includes(url));

  const manifest = {
    schema: 1,
    docsRoot: DOCS_ROOT,
    syncedAt: isoTimestamp,
    pages: manifestPages,
    sitemap: {
      fetchedAt: isoTimestamp,
      urlsUnderRoot: urlsUnderRoot.length,
      knownUnmapped,
    },
  };

  if (!isCheckOnly) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const report = {
      ranAt: isoTimestamp,
      baseline: false,
      docsRoot: DOCS_ROOT,
      pages: reportPages,
    };

    fs.writeFileSync(path.join(reportsDir, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(path.join(reportsDir, `${timestampFilePart}.json`), JSON.stringify(report, null, 2), 'utf8');

    // Retain up to 3 timestamped reports
    const allReportFiles = fs
      .readdirSync(reportsDir)
      .filter((f) => f.endsWith('.json') && f !== 'latest.json')
      .sort()
      .reverse();

    if (allReportFiles.length > 3) {
      for (const f of allReportFiles.slice(3)) {
        fs.unlinkSync(path.join(reportsDir, f));
      }
    }
  }

  // Update CHANGELOG if changes detected and not check-only
  if (changedPages.length > 0 && !isCheckOnly) {
    const changelogDateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
    const highestSeverity = changedPages.some((p) => p.severity === 'high')
      ? 'high'
      : changedPages.some((p) => p.severity === 'medium')
        ? 'medium'
        : 'low';

    let entry = `## ${changelogDateStr}\n\n### ${timeStr} — ${changedPages.length} page${changedPages.length === 1 ? '' : 's'}, highest severity ${highestSeverity}\n\n`;

    for (const cp of changedPages) {
      const routeStr = cp.routes.length > 0 ? ` · route \`${cp.routes.join('`, `')}\`` : '';
      const headingStr = cp.hunks[0]?.heading ? ` · under “${cp.hunks[0].heading}”` : '';
      entry += `**${cp.severity.charAt(0).toUpperCase() + cp.severity.slice(1)} — ${cp.title}**\n\n`;
      entry += `\`${cp.docPath}\`${routeStr}${headingStr}\n\n`;
      entry += `${cp.codeLines} code lines, ${cp.proseLines} prose lines changed.\n\n`;
      entry += '```diff\n';
      for (const h of cp.hunks.slice(0, 3)) {
        for (const l of h.lines) {
          const prefix = l.op === 'add' ? '+ ' : l.op === 'remove' ? '- ' : '  ';
          entry += `${prefix}${l.text}\n`;
        }
      }
      entry += '```\n\n';
    }

    let currentChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
    const headerEndIdx = currentChangelog.indexOf('## ');
    if (headerEndIdx !== -1) {
      const header = currentChangelog.substring(0, headerEndIdx);
      const existingEntries = currentChangelog.substring(headerEndIdx).split(/(?=^## \d{4}-\d{2}-\d{2})/m);
      const updatedEntries = [entry.trim(), ...existingEntries.map((e) => e.trim()).filter(Boolean)].slice(0, 3);
      fs.writeFileSync(changelogPath, `${header.trim()}\n\n${updatedEntries.join('\n\n')}\n`, 'utf8');
    } else {
      fs.writeFileSync(changelogPath, `${currentChangelog.trim()}\n\n${entry}`, 'utf8');
    }
  }

  // Summary output
  console.log('----------------------------------------------------');
  console.log(`📊 Summary: Checked ${DOC_PAGES.length} documentation pages against live docs.`);
  if (changedPages.length === 0) {
    console.log(`✅ Status: ALL ${DOC_PAGES.length} PAGES ARE UP TO DATE (0 doc drift detected).`);
  } else {
    console.log(`⚠️ Status: ${changedPages.length} page(s) changed:`);
    for (const p of changedPages) {
      console.log(`  - [${p.severity.toUpperCase()}] ${p.docPath} (${p.title}): ${p.codeLines} code, ${p.proseLines} prose lines`);
    }
  }
  if (sitemapRes.status !== 200) {
    console.log(`ℹ️ Sitemap unreachable (HTTP ${sitemapRes.status}); new upstream pages not checked.`);
  } else {
    console.log(`🗺️ Sitemap: ${urlsUnderRoot.length} URL(s) under ${DOCS_ROOT}, ${newUnmapped.length} not tracked here.`);
    for (const url of newUnmapped) {
      console.log(`  - NEW: ${url} (add to DOC_PAGES, or to sitemap.knownUnmapped in the manifest to acknowledge)`);
    }
  }
  console.log('----------------------------------------------------\n');
}

run().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
