/** Last newly accepted word in `current` vs `previous` snapshot (acceptance order). */
export function findLastAddedNormalized(
  previous: readonly string[],
  current: readonly string[],
): string | null {
  const previousSet = new Set(previous);
  let lastAdded: string | null = null;
  for (const normalized of current) {
    if (!previousSet.has(normalized)) {
      lastAdded = normalized;
    }
  }
  return lastAdded;
}

/** Index of a row in an alphabetically sorted word list. */
export function findRowIndexByNormalized(
  rows: readonly { entry: { normalized: string } }[],
  normalized: string,
): number {
  return rows.findIndex((row) => row.entry.normalized === normalized);
}

/** Pixel offset for a fixed-height FlatList row. */
export function rowScrollOffset(index: number, rowHeight: number): number {
  return rowHeight * index;
}
