import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectPages } from '../core/select';
import { type PageRecordConfig } from '../core/types';

const page = (id: string, name = id, extra: Partial<PageRecordConfig> = {}): PageRecordConfig =>
  ({
    id,
    name,
    videoName: id,
    docPath: id,
    route: id,
    ideFile: 'x',
    startLine: 1,
    endLine: 1,
    prompt: 'p',
    docUrl: '',
    demoUrl: '',
    filename: id,
    order: 0,
    ...extra,
  }) as PageRecordConfig;

const ALL = [
  page('quickstart', 'Quickstart'),
  page('slots', 'Custom Look and Feel - Slots'),
  page('headless-ui', 'Custom Look and Feel - Headless UI'),
  page('demo-npm', 'npm demo', { generated: true }),
];

test('no request records everything except the excluded set', () => {
  const { pages } = selectPages(ALL, { excluded: new Set(['demo-npm']) });
  assert.deepEqual(pages.map((p) => p.id), ['quickstart', 'slots', 'headless-ui']);
});

test('naming an excluded page explicitly still selects it', () => {
  const { pages } = selectPages(ALL, { page: 'demo-npm', excluded: new Set(['demo-npm']) });
  assert.deepEqual(pages.map((p) => p.id), ['demo-npm']);
});

test('ids win over everything else and are case-insensitive', () => {
  const { pages } = selectPages(ALL, { ids: ['SLOTS', 'quickstart'], page: 'headless-ui', filter: 'x' });
  assert.deepEqual(pages.map((p) => p.id), ['quickstart', 'slots']);
});

test('filter and bare words match id or name substrings', () => {
  assert.deepEqual(selectPages(ALL, { filter: 'look and feel' }).pages.map((p) => p.id), ['slots', 'headless-ui']);
  assert.deepEqual(selectPages(ALL, { queries: ['quick', 'npm'] }).pages.map((p) => p.id), ['quickstart', 'demo-npm']);
});

test('limit truncates the selection', () => {
  const { pages } = selectPages(ALL, { limit: 3 });
  assert.deepEqual(pages.map((p) => p.id), ['quickstart', 'slots', 'headless-ui']);
});

test('limit applies after the filter', () => {
  const { pages } = selectPages(ALL, { filter: 'look and feel', limit: 1 });
  assert.deepEqual(pages.map((p) => p.id), ['slots']);
});
