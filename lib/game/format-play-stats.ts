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

/** Visual weight for compact play-header stat fragments. */
export type PlayStatsCompactSegmentVariant = 'normal' | 'deemphasized';

/** One styled fragment of compact play-header stats text. */
export interface PlayStatsCompactSegment {
  text: string;
  variant: PlayStatsCompactSegmentVariant;
}

const DEFAULT_LABELS: PlayStatsLabels = {
  rankSuffix: 'м',
  wordsSuffix: 'сл',
  pointsSuffix: 'оч',
  placeLabel: (rank) => `${rank} місце`,
  pointsLabel: (score) =>
    `${score} ${score === 1 ? 'очко' : score >= 2 && score <= 4 ? 'очки' : 'очок'}`,
};

function pushPlayStatsSeparator(segments: PlayStatsCompactSegment[]): void {
  if (segments.length > 0) {
    segments.push({ text: ' · ', variant: 'normal' });
  }
}

/**
 * Compact play header stats as styled fragments (max word count is de-emphasized).
 */
export function formatPlayStatsCompactSegments(
  input: PlayStatsInput,
  labels: Pick<PlayStatsLabels, 'rankSuffix' | 'wordsSuffix' | 'pointsSuffix'> = DEFAULT_LABELS,
): PlayStatsCompactSegment[] {
  const segments: PlayStatsCompactSegment[] = [];

  if (input.showRank !== false) {
    segments.push({ text: `${input.rank}${labels.rankSuffix}`, variant: 'normal' });
  }

  pushPlayStatsSeparator(segments);
  segments.push({ text: `${input.wordCount}`, variant: 'normal' });
  if (input.maxWordCount != null && input.maxWordCount > 0) {
    segments.push({ text: `/${input.maxWordCount}`, variant: 'deemphasized' });
  }
  segments.push({ text: labels.wordsSuffix, variant: 'normal' });

  if (input.showScore !== false) {
    pushPlayStatsSeparator(segments);
    segments.push({ text: `${input.score}${labels.pointsSuffix}`, variant: 'normal' });
  }

  return segments;
}

/**
 * Compact play header stats (e.g. `2м · 12/571сл · 14оч`).
 */
export function formatPlayStatsCompact(
  input: PlayStatsInput,
  labels: Pick<PlayStatsLabels, 'rankSuffix' | 'wordsSuffix' | 'pointsSuffix'> = DEFAULT_LABELS,
): string {
  return formatPlayStatsCompactSegments(input, labels)
    .map((segment) => segment.text)
    .join('');
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
