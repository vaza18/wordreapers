/** Show every author avatar when count is at most this. */
export const RESULTS_ALL_AUTHORS_VISIBLE_MAX = 4;

/** When above cap, show this many avatars before «+N». */
export const RESULTS_OVERFLOW_AVATAR_VISIBLE = 3;

/** Split authors into inline avatars vs overflow «+N» list. */
export function splitResultWordAuthors<T extends { playerId: string }>(
  authors: readonly T[],
): { visible: readonly T[]; overflow: readonly T[] } {
  if (authors.length <= RESULTS_ALL_AUTHORS_VISIBLE_MAX) {
    return { visible: authors, overflow: [] };
  }
  const visible = authors.slice(0, RESULTS_OVERFLOW_AVATAR_VISIBLE);
  const overflow = authors.slice(RESULTS_OVERFLOW_AVATAR_VISIBLE);
  return { visible, overflow };
}
