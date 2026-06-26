import { formatUkWords } from '../i18n/uk-plural.js';

/** i18n labels for compact and accessible play stats formatting. */
export interface PlayStatsLabels {
  rankSuffix: string;
  wordsSuffix: string;
  pointsSuffix: string;
  placeLabel: (rank: number) => string;
  pointsLabel: (score: number) => string;
}

/** Rank, word count, and score shown in the play header and pause UI. */
export interface PlayStatsInput {
  rank: number;
  wordCount: number;
  maxWordCount?: number | null;
  score: number;
  showRank?: boolean;
  showScore?: boolean;
}

const DEFAULT_LABELS: PlayStatsLabels = {
  rankSuffix: 'м',
  wordsSuffix: 'сл',
  pointsSuffix: 'оч',
  placeLabel: (rank) => `${rank} місце`,
  pointsLabel: (score) =>
    `${score} ${score === 1 ? 'очко' : score >= 2 && score <= 4 ? 'очки' : 'очок'}`,
};

/**
 * Compact play header stats (e.g. `2м · 12/571сл · 14оч`).
 */
export function formatPlayStatsCompact(
  input: PlayStatsInput,
  labels: Pick<PlayStatsLabels, 'rankSuffix' | 'wordsSuffix' | 'pointsSuffix'> = DEFAULT_LABELS,
): string {
  const parts: string[] = [];
  if (input.showRank !== false) {
    parts.push(`${input.rank}${labels.rankSuffix}`);
  }
  const wordsLabel =
    input.maxWordCount != null && input.maxWordCount > 0
      ? `${input.wordCount}/${input.maxWordCount}${labels.wordsSuffix}`
      : `${input.wordCount}${labels.wordsSuffix}`;
  parts.push(wordsLabel);
  if (input.showScore !== false) {
    parts.push(`${input.score}${labels.pointsSuffix}`);
  }
  return parts.join(' · ');
}

/**
 * Screen-reader / pause-modal friendly stats with full Ukrainian words.
 */
export function formatPlayStatsAccessible(
  input: PlayStatsInput,
  labels: PlayStatsLabels = DEFAULT_LABELS,
): string {
  const parts: string[] = [];
  if (input.showRank !== false) {
    parts.push(labels.placeLabel(input.rank));
  }
  const wordsPart =
    input.maxWordCount != null && input.maxWordCount > 0
      ? `${formatUkWords(input.wordCount)} з ${input.maxWordCount}`
      : formatUkWords(input.wordCount);
  parts.push(wordsPart);
  if (input.showScore !== false) {
    parts.push(labels.pointsLabel(input.score));
  }
  return parts.join(' · ');
}

/** Standing row meta for pause modal / standings sheet (full words). */
export function formatStandingRowMeta(
  wordCount: number,
  score: number | null,
  labels: Pick<PlayStatsLabels, 'pointsLabel'> = DEFAULT_LABELS,
): string {
  const words = formatUkWords(wordCount);
  if (score == null) {
    return words;
  }
  return `${words} · ${labels.pointsLabel(score)}`;
}
