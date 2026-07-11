/** Solo training round success level ids (lowest → highest). */
export const SOLO_SUCCESS_LEVEL_IDS = [
  'none',
  'progress',
  'goodPace',
  'strong',
  'top',
  'champion',
] as const;

export type SoloSuccessLevelId = (typeof SOLO_SUCCESS_LEVEL_IDS)[number];

/** Absolute word-count thresholds (OR with ratio). */
export const SOLO_SUCCESS_GOOD_PACE_ABS = 25;
export const SOLO_SUCCESS_STRONG_ABS = 100;
export const SOLO_SUCCESS_TOP_ABS = 200;
export const SOLO_SUCCESS_CHAMPION_ABS = 300;

/** Ratio-of-lexiconMax thresholds (OR with absolute). */
export const SOLO_SUCCESS_GOOD_PACE_RATIO = 0.05;
export const SOLO_SUCCESS_STRONG_RATIO = 0.2;
export const SOLO_SUCCESS_TOP_RATIO = 0.3;
export const SOLO_SUCCESS_CHAMPION_RATIO = 0.5;

/** Medal emoji for medal tiers (none for lower levels). */
export const SOLO_SUCCESS_MEDALS: Readonly<Partial<Record<SoloSuccessLevelId, string>>> = {
  strong: '🥉',
  top: '🥈',
  champion: '🥇',
};

/** Levels that fire confetti when first entered during a round. */
export const SOLO_SUCCESS_CONFETTI_LEVELS: ReadonlySet<SoloSuccessLevelId> = new Set([
  'strong',
  'top',
  'champion',
]);
