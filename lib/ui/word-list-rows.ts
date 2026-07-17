import { toDisplayUpper } from '@/lib/dictionary/normalize';
import type { ScoredWordEntry } from '@/lib/game/scoring';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';

/** Scored word plus optional overlap peers for the play list. */
export type WordListRowEntry = ScoredWordEntry & {
  overlapPeers?: readonly WordOverlapPeer[];
};

/** One virtualized / static word-list row. */
export type WordListRow = {
  key: string;
  entry: WordListRowEntry;
  display: string;
};

function makeRow(entry: WordListRowEntry, display: string): WordListRow {
  return {
    key: `${entry.normalized}-${display}`,
    entry,
    display,
  };
}

function overlapPeersEqual(
  a: readonly WordOverlapPeer[] | undefined,
  b: readonly WordOverlapPeer[] | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) {
      return false;
    }
    if (
      left.playerId !== right.playerId ||
      left.name !== right.name ||
      left.avatarColorIndex !== right.avatarColorIndex
    ) {
      return false;
    }
  }
  return true;
}

function entryVisualEqual(a: WordListRowEntry, b: WordListRowEntry): boolean {
  return (
    a.normalized === b.normalized &&
    a.kind === b.kind &&
    a.points === b.points &&
    a.badge === b.badge &&
    overlapPeersEqual(a.overlapPeers, b.overlapPeers)
  );
}

function compareNormalized(a: string, b: string): number {
  return a.localeCompare(b, 'uk');
}

/** Binary-insert one row into an already-sorted list (uk collation). */
export function insertSortedWordListRow(
  rows: readonly WordListRow[],
  row: WordListRow,
): WordListRow[] {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const current = rows[mid];
    if (!current || compareNormalized(current.entry.normalized, row.entry.normalized) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const existing = rows[lo];
  if (existing && compareNormalized(existing.entry.normalized, row.entry.normalized) === 0) {
    const next = rows.slice();
    next[lo] = row;
    return next;
  }
  const next = rows.slice();
  next.splice(lo, 0, row);
  return next;
}

function fullSortedBuild(
  entries: readonly WordListRowEntry[],
  displays: readonly string[],
  previousByNorm: Map<string, WordListRow> | null,
): WordListRow[] {
  const rows = entries.map((entry, index) => {
    const display = displays[index] ?? toDisplayUpper(entry.normalized);
    const previous = previousByNorm?.get(entry.normalized);
    if (previous && previous.display === display && entryVisualEqual(previous.entry, entry)) {
      return previous;
    }
    return makeRow(entry, display);
  });
  rows.sort((a, b) => compareNormalized(a.entry.normalized, b.entry.normalized));
  return rows;
}

/**
 * Build alphabetically sorted word-list rows, reusing previous row objects when
 * only a single word was added or a subset of rows changed visually.
 */
export function buildSortedWordListRows(
  entries: readonly WordListRowEntry[],
  displays: readonly string[],
  previousRows: readonly WordListRow[] | null,
): WordListRow[] {
  if (!previousRows || previousRows.length === 0) {
    return fullSortedBuild(entries, displays, null);
  }

  const previousByNorm = new Map(previousRows.map((row) => [row.entry.normalized, row]));
  const nextNorms = new Set(entries.map((entry) => entry.normalized));

  const added: WordListRow[] = [];
  const updatedByNorm = new Map<string, WordListRow>();

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }
    const display = displays[i] ?? toDisplayUpper(entry.normalized);
    const previous = previousByNorm.get(entry.normalized);
    if (!previous) {
      added.push(makeRow(entry, display));
      continue;
    }
    if (previous.display !== display || !entryVisualEqual(previous.entry, entry)) {
      updatedByNorm.set(entry.normalized, makeRow(entry, display));
    }
  }

  let removedCount = 0;
  for (const row of previousRows) {
    if (!nextNorms.has(row.entry.normalized)) {
      removedCount += 1;
    }
  }

  if (added.length === 1 && removedCount === 0 && updatedByNorm.size === 0) {
    const onlyAdded = added[0];
    if (onlyAdded) {
      return insertSortedWordListRow(previousRows, onlyAdded);
    }
  }

  if (added.length === 0 && removedCount === 0 && updatedByNorm.size > 0) {
    return previousRows.map((row) => updatedByNorm.get(row.entry.normalized) ?? row);
  }

  if (added.length === 0 && removedCount > 0 && updatedByNorm.size === 0) {
    return previousRows.filter((row) => nextNorms.has(row.entry.normalized));
  }

  return fullSortedBuild(entries, displays, previousByNorm);
}

/** FlatList `extraData` marker so a stable `renderItem` still refreshes when needed. */
export function wordListRenderExtraData(
  prefix: string,
  entranceNormalizes: ReadonlySet<string>,
  highlightNormalizes: ReadonlySet<string>,
): string {
  const entrance = [...entranceNormalizes].sort().join('\0');
  const highlight = [...highlightNormalizes].sort().join('\0');
  return `${prefix}\n${entrance}\n${highlight}`;
}
