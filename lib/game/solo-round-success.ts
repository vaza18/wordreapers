import {
  SOLO_SUCCESS_CHAMPION_ABS,
  SOLO_SUCCESS_CHAMPION_RATIO,
  SOLO_SUCCESS_GOOD_PACE_ABS,
  SOLO_SUCCESS_GOOD_PACE_RATIO,
  SOLO_SUCCESS_LEVEL_IDS,
  SOLO_SUCCESS_MEDALS,
  SOLO_SUCCESS_STRONG_ABS,
  SOLO_SUCCESS_STRONG_RATIO,
  SOLO_SUCCESS_TOP_ABS,
  SOLO_SUCCESS_TOP_RATIO,
  type SoloSuccessLevelId,
} from '@/constants/solo-round-success-constants';

export type { SoloSuccessLevelId };

type TierThreshold = {
  id: Exclude<SoloSuccessLevelId, 'none' | 'progress'>;
  abs: number;
  ratio: number;
};

const TIER_THRESHOLDS: readonly TierThreshold[] = [
  { id: 'goodPace', abs: SOLO_SUCCESS_GOOD_PACE_ABS, ratio: SOLO_SUCCESS_GOOD_PACE_RATIO },
  { id: 'strong', abs: SOLO_SUCCESS_STRONG_ABS, ratio: SOLO_SUCCESS_STRONG_RATIO },
  { id: 'top', abs: SOLO_SUCCESS_TOP_ABS, ratio: SOLO_SUCCESS_TOP_RATIO },
  { id: 'champion', abs: SOLO_SUCCESS_CHAMPION_ABS, ratio: SOLO_SUCCESS_CHAMPION_RATIO },
];

/** Segment boundaries for the thin progress bar (current → next). */
const BAR_SEGMENT_TARGETS: readonly SoloSuccessLevelId[] = [
  'progress',
  'goodPace',
  'strong',
  'top',
  'champion',
];

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

/**
 * Words needed to reach a named level for this lexicon size.
 * `progress` (leaving zero words) is always 1.
 * Tier levels use `min(ceil(ratio * lexiconMax), abs)`.
 */
export function wordsNeeded(level: SoloSuccessLevelId, lexiconMax: number): number {
  if (level === 'none') {
    return 0;
  }
  if (level === 'progress') {
    return 1;
  }
  if (lexiconMax <= 0) {
    return 1;
  }
  const tier = TIER_THRESHOLDS.find((entry) => entry.id === level);
  if (!tier) {
    return 1;
  }
  return Math.min(Math.ceil(tier.ratio * lexiconMax), tier.abs);
}

/** Highest matching success level for a solo training round. */
export function resolveRoundSuccessLevel(
  wordCount: number,
  lexiconMax: number,
): SoloSuccessLevelId {
  if (wordCount <= 0 || lexiconMax <= 0) {
    return 'none';
  }

  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    const tier = TIER_THRESHOLDS[i];
    if (!tier) {
      continue;
    }
    const needed = wordsNeeded(tier.id, lexiconMax);
    if (wordCount >= needed) {
      return tier.id;
    }
  }

  return 'progress';
}

/** Inputs for the thin solo success progress bar segment. */
export type SoloSuccessBarSegment = {
  levelId: SoloSuccessLevelId;
  startWords: number;
  endWords: number;
  fill01: number;
  nextLevelId: SoloSuccessLevelId | null;
  wordsToNext: number;
};

/**
 * Segment of the thin bar from the current level toward the next.
 * Champion → fill=1, no next.
 */
export function resolveSuccessBarSegment(
  wordCount: number,
  lexiconMax: number,
): SoloSuccessBarSegment {
  const levelId = resolveRoundSuccessLevel(wordCount, lexiconMax);

  if (levelId === 'champion') {
    const endWords = wordsNeeded('champion', lexiconMax);
    return {
      levelId,
      startWords: endWords,
      endWords,
      fill01: 1,
      nextLevelId: null,
      wordsToNext: 0,
    };
  }

  const levelIndex = SOLO_SUCCESS_LEVEL_IDS.indexOf(levelId);
  const nextLevelId = BAR_SEGMENT_TARGETS.find(
    (target) => SOLO_SUCCESS_LEVEL_IDS.indexOf(target) > levelIndex,
  );

  if (!nextLevelId) {
    return {
      levelId,
      startWords: 0,
      endWords: 1,
      fill01: 0,
      nextLevelId: null,
      wordsToNext: 0,
    };
  }

  const startWords = levelId === 'none' ? 0 : wordsNeeded(levelId, lexiconMax);
  const endWords = wordsNeeded(nextLevelId, lexiconMax);
  const span = endWords - startWords;
  const fill01 =
    span <= 0 ? (wordCount >= endWords ? 1 : 0) : clamp01((wordCount - startWords) / span);
  const wordsToNext = Math.max(0, endWords - wordCount);

  return {
    levelId,
    startWords,
    endWords,
    fill01,
    nextLevelId,
    wordsToNext,
  };
}

/** Medal emoji for a level, or null when the tier has no medal. */
export function soloSuccessMedal(levelId: SoloSuccessLevelId): string | null {
  return SOLO_SUCCESS_MEDALS[levelId] ?? null;
}
