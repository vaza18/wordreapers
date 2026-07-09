/** Whether a word row should show draft-prefix highlight styling. */
export function rowMatchesDraftPrefix(normalized: string, prefix: string): boolean {
  return prefix.length > 0 && normalized.startsWith(prefix);
}

/** Props compared by {@link shouldSkipWordListRowRerender} for WordList row memoization. */
export type WordListRowMemoProps = {
  row: { entry: { normalized: string }; display: string };
  prefix: string;
  showScoreBadges: boolean;
  showOverlapPeers: boolean;
  styles: unknown;
  notebookRow: unknown;
  animateEntrance: boolean;
};

/**
 * React.memo comparator: return true when props are equal enough to skip re-render.
 * Prefix changes only re-render rows whose match status or split display changes.
 */
export function shouldSkipWordListRowRerender(
  prev: WordListRowMemoProps,
  next: WordListRowMemoProps,
): boolean {
  if (prev.row !== next.row) {
    return false;
  }
  if (prev.showScoreBadges !== next.showScoreBadges) {
    return false;
  }
  if (prev.showOverlapPeers !== next.showOverlapPeers) {
    return false;
  }
  if (prev.styles !== next.styles) {
    return false;
  }
  if (prev.notebookRow !== next.notebookRow) {
    return false;
  }
  if (prev.animateEntrance !== next.animateEntrance) {
    return false;
  }

  const prevMatch = rowMatchesDraftPrefix(prev.row.entry.normalized, prev.prefix);
  const nextMatch = rowMatchesDraftPrefix(next.row.entry.normalized, next.prefix);
  if (prevMatch !== nextMatch) {
    return false;
  }
  if (nextMatch && prev.prefix !== next.prefix) {
    return false;
  }

  return true;
}
