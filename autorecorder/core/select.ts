import { type PageRecordConfig } from './types';

/**
 * Which pages a `record` invocation means, as a pure function.
 *
 * Kept apart from `cli.ts` so it can be unit-tested without a browser, and so
 * the rules are in one place. In priority order:
 *
 *   --pages=a,b / --only=a,b   exactly these ids
 *   --page=<id>, --<id>, <id>  one page by id
 *   --filter=<q>               ids or names containing q
 *   bare words                 ids or names containing any of them
 *   nothing                    every page not in `excluded`
 *
 * Then `--limit` truncates.
 *
 * Naming a page explicitly always selects it, even when it is in `excluded`:
 * "record this specific thing" should record it and report what happens.
 */
export interface SelectionRequest {
  /** From `--pages`/`--only`. */
  ids?: string[];
  /** From `--page`, `--<id>` or a positional id. */
  page?: string;
  /** From `--filter`. */
  filter?: string;
  /** Bare words that matched no id. */
  queries?: string[];
  limit?: number;
  /** Ids dropped from an *unfiltered* run only. */
  excluded?: Set<string>;
}

export interface Selection {
  pages: PageRecordConfig[];
}

const lower = (s: string): string => s.toLowerCase();

export function selectPages(all: PageRecordConfig[], req: SelectionRequest): Selection {
  let pages: PageRecordConfig[];

  if (req.ids?.length) {
    const wanted = new Set(req.ids.map(lower));
    pages = all.filter((p) => wanted.has(lower(p.id)));
  } else if (req.page) {
    const id = lower(req.page);
    pages = all.filter((p) => lower(p.id) === id);
  } else if (req.filter) {
    const q = lower(req.filter);
    pages = all.filter((p) => lower(p.id).includes(q) || lower(p.name).includes(q));
  } else if (req.queries?.length) {
    const qs = req.queries.map(lower);
    pages = all.filter((p) => qs.some((q) => lower(p.id).includes(q) || lower(p.name).includes(q)));
  } else {
    const excluded = req.excluded ?? new Set<string>();
    pages = all.filter((p) => !excluded.has(p.id));
  }

  if (req.limit && req.limit > 0) pages = pages.slice(0, req.limit);

  return { pages };
}
