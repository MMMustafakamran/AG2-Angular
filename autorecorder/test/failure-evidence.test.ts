import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildFailureEvidence,
  findAnchor,
  snapshotLogOffsets,
  writeFailureLog,
} from '../core/failure-evidence';
import { GREP_PATTERN, failureCommands, pickLogs } from '../core/failure-terminal';

test('findAnchor prefers a traceback, then the last error-like line', () => {
  assert.equal(findAnchor(['ok', 'Traceback (most recent call last):', '  File x', 'ValueError: bad']), 1);
  assert.equal(findAnchor(['INFO started', 'GET /run 404', 'INFO idle']), 1);
  assert.equal(findAnchor(['a', 'b']), -1);
  assert.equal(findAnchor([]), -1);
});

test('log tail is sliced from the offset taken when the page started', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-'));
  const backend = join(dir, 'backend.log');
  writeFileSync(backend, 'old line 1\nold line 2\n');
  const logs = snapshotLogOffsets(dir);
  assert.equal(logs.length, 1);
  writeFileSync(backend, 'old line 1\nold line 2\nnew INFO\nnew Exception: boom\n');

  const ev = buildFailureEvidence({ pageId: 'p', error: 'Demo step failed: x', logs });
  const section = ev.sections.find((s) => s.title.startsWith('backend.log'))!;
  assert.deepEqual(section.lines, ['new INFO', 'new Exception: boom']);
  assert.equal(section.anchor, 1);
  assert.ok(ev.text.includes('>> new Exception: boom'));

  const file = writeFailureLog(dir, ev);
  assert.equal(readFileSync(file, 'utf8'), ev.text);
  assert.ok(file.endsWith('p.error.log'));
});

test('long logs are windowed around the anchor, not truncated at the head', () => {
  const lines = Array.from({ length: 200 }, (_, i) => (i === 150 ? 'RuntimeError: here' : `line ${i}`));
  const dir = mkdtempSync(join(tmpdir(), 'evidence-'));
  writeFileSync(join(dir, 'frontend.log'), lines.join('\n'));
  const ev = buildFailureEvidence({ pageId: 'p', error: 'x', logs: snapshotLogOffsets(dir).map((l) => ({ ...l, fromByte: 0 })), maxLines: 30 });
  const s = ev.sections.find((x) => x.title.startsWith('frontend.log'))!;
  assert.equal(s.lines.length, 30);
  assert.equal(s.lines[s.anchor], 'RuntimeError: here');
  assert.ok(s.omittedBefore > 0);
});

test('the failure terminal types real commands on the logs this page wrote to', () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-root-'));
  const logs = join(root, 'logs');
  mkdirSync(logs);
  writeFileSync(join(logs, 'agent-8152.log'), 'boot\n');
  writeFileSync(join(logs, 'vite-5150.log'), 'ready\n');
  writeFileSync(join(logs, 'record.log'), 'recorder output\n');
  const sources = snapshotLogOffsets(join(root, 'videos'), [logs]);
  assert.deepEqual(sources.map((s) => s.title), ['agent-8152.log', 'vite-5150.log']);
  writeFileSync(join(logs, 'agent-8152.log'), 'boot\nPOST /runs 404\nError: graph not found\n');

  const picked = pickLogs(sources);
  assert.deepEqual(picked.logs.map((l) => l.title), ['agent-8152.log']);
  assert.equal(picked.grepLog?.title, 'agent-8152.log');

  const cmds = failureCommands('bash', root, sources);
  assert.deepEqual(cmds, [
    'ls logs/',
    'tail -n 25 logs/agent-8152.log',
    `grep -n -i -E --color=always "${GREP_PATTERN}" logs/agent-8152.log | tail -n 8`,
  ]);
  const ps = failureCommands('powershell', root, sources);
  assert.ok(ps[1].startsWith('Get-Content '));
});

test('with no log written during the page, every log is tailed and nothing is grepped', () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-root-'));
  const logs = join(root, 'logs');
  mkdirSync(logs);
  writeFileSync(join(logs, 'a.log'), 'x\n');
  writeFileSync(join(logs, 'b.log'), 'y\n');
  const cmds = failureCommands('bash', root, snapshotLogOffsets(join(root, 'videos'), [logs]));
  assert.deepEqual(cmds, ['ls logs/', 'tail -n 25 logs/a.log', 'tail -n 25 logs/b.log']);
});
