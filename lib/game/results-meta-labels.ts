import { formatUkWords, ukWordForm } from '../i18n/uk-plural.js';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * Shared results header meta: optional base word, WPM, duration, lexicon options.
 * Never includes found / lexicon word counts.
 */
export function formatResultsSharedMetaLabel(
  t: TranslateFn,
  opts: {
    showBaseWordInMeta: boolean;
    baseWordDisplay: string;
    wordsPerMinute: number | null;
    roundDurationLabel: string | null;
    lexiconSuffix: string | null;
  },
): string | null {
  const parts: string[] = [];
  if (opts.showBaseWordInMeta) {
    parts.push(t('game.resultsBaseWordOnly', { word: opts.baseWordDisplay }));
  }
  if (opts.wordsPerMinute != null) {
    parts.push(t('game.resultsWordsPerMinuteShort', { rate: opts.wordsPerMinute }));
  }
  if (opts.roundDurationLabel) {
    parts.push(t('game.resultsRoundDuration', { duration: opts.roundDurationLabel }));
  }
  if (opts.lexiconSuffix) {
    parts.push(opts.lexiconSuffix);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join(' · ');
}

/**
 * Caption for words currently listed on «Всі слова» vs lexicon size.
 */
export function formatResultsVisibleWordsCaption(
  t: TranslateFn,
  opts: {
    visibleCount: number;
    maxPlayableWords: number | null;
  },
): string | null {
  const { visibleCount, maxPlayableWords } = opts;
  if (maxPlayableWords != null && maxPlayableWords > 0) {
    return t('game.resultsWordsMetaWithMax', {
      count: visibleCount,
      max: maxPlayableWords,
      wordsLabel: ukWordForm(visibleCount),
    });
  }
  if (visibleCount < 0) {
    return null;
  }
  return formatUkWords(visibleCount);
}
