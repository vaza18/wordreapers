/** Suggestion row height at the design font scale. */
export const BASE_WORD_SUGGEST_ROW_HEIGHT = 40;

/** Max scroll area height for suggestions at the design font scale (~5 rows). */
export const BASE_WORD_SUGGEST_MAX_LIST_HEIGHT = 200;

/** Footer row height for the “more matches” hint at the design font scale. */
export const BASE_WORD_SUGGEST_MORE_ROW_HEIGHT = 32;

/**
 * After TextInput blur, wait before hiding suggestions.
 * Lexicon commit (`immediate`) runs synchronously on blur so Start/Invite unmount still prefetches.
 */
export const BASE_WORD_SUGGEST_BLUR_MS = 200;

/**
 * Ignore stale `onChangeText` after suggest/shuffle writes (iOS keyboard dismiss).
 * Longer than {@link BASE_WORD_SUGGEST_BLUR_MS} for slow devices.
 */
export const BASE_WORD_SUGGEST_IGNORE_CHANGE_MS = 400;
