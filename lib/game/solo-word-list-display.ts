import type { ScoredWordEntry, WordScoreBadge, WordScoreKind } from '@/lib/game/scoring';

/** Minimal solo word shape needed for the play word list. */
export type SoloWordListSource = {
  normalized: string;
  display: string;
  kind: WordScoreKind;
  points: number;
  badge: WordScoreBadge;
};

/**
 * Build stable word-list props from solo accepted words.
 * Callers should memoize on the `words` reference so keystrokes do not allocate new arrays.
 */
export function buildSoloWordListDisplay(words: readonly SoloWordListSource[]): {
  entries: ScoredWordEntry[];
  displays: string[];
} {
  return {
    entries: words.map((word) => ({
      normalized: word.normalized,
      kind: word.kind,
      points: word.points,
      badge: word.badge,
    })),
    displays: words.map((word) => word.display),
  };
}
