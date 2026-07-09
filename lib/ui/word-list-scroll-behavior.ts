/** FlatList scroll behavior for word-list navigation. */
export type WordListScrollOptions = {
  animated: boolean;
  /** Retry scroll after layout settles (accept scroll only). */
  retries: boolean;
};

export const PREFIX_SCROLL_DEBOUNCE_MS = 100;

/** Default scroll behavior when a newly accepted word appears in the list. */
export const ACCEPTED_WORD_SCROLL_OPTIONS: WordListScrollOptions = {
  animated: true,
  retries: true,
};

/** Draft prefix navigation — no animation competition with letter fly. */
export const PREFIX_NAV_SCROLL_OPTIONS: WordListScrollOptions = {
  animated: false,
  retries: false,
};
