#!/usr/bin/env node
/**
 * Turn the dispatch form into a comma-separated page list for the recorder.
 *
 * Run once in the `prepare` job; the three shards consume the result, so
 * selection is resolved and validated in one place instead of three.
 *
 *   node ci/resolve-selection.mjs --pages="quickstart,auth" --groups="threads,backend"
 *
 * Prints the ids on stdout, or nothing at all when the selection is empty
 * (which the workflow reads as "record every page").
 */
import { resolveSelection } from './lib/pages.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

try {
  const groups = argValue('groups')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const selected = resolveSelection({ pages: argValue('pages'), groups });

  // stdout stays machine-readable; commentary goes to stderr.
  if (selected.length === 0) {
    console.error('ℹ️ Nothing selected — recording all pages.');
  } else {
    console.error(`✅ ${selected.length} page(s) selected: ${selected.join(', ')}`);
  }
  process.stdout.write(selected.join(','));
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
