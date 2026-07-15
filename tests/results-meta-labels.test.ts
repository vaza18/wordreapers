import { describe, expect, it } from 'vitest';

import i18n from '../i18n/index.js';
import {
  formatResultsSharedMetaLabel,
  formatResultsVisibleWordsCaption,
} from '../lib/game/results-meta-labels.js';
import { formatResultsLexiconOptionsSuffix } from '../lib/online/play-rules-label.js';

const t = i18n.t.bind(i18n);

describe('formatResultsSharedMetaLabel', () => {
  it('joins duration and lexicon options without word count', () => {
    const lexiconSuffix = formatResultsLexiconOptionsSuffix(t, {
      allowProperNouns: true,
      allowSlang: true,
    });
    const label = formatResultsSharedMetaLabel(t, {
      showBaseWordInMeta: false,
      baseWordDisplay: 'ПОРТ',
      wordsPerMinute: null,
      roundDurationLabel: '5 хв',
      lexiconSuffix,
    });
    expect(label).toBe('Тривалість: 5 хв · власні назви та сленг');
  });

  it('includes WPM before duration when provided', () => {
    const label = formatResultsSharedMetaLabel(t, {
      showBaseWordInMeta: false,
      baseWordDisplay: 'ПОРТ',
      wordsPerMinute: 12,
      roundDurationLabel: '5 хв',
      lexiconSuffix: null,
    });
    expect(label).toBe('12 сл/хв · Тривалість: 5 хв');
  });

  it('includes base word when showBaseWordInMeta is true', () => {
    const label = formatResultsSharedMetaLabel(t, {
      showBaseWordInMeta: true,
      baseWordDisplay: 'ПОРТ',
      wordsPerMinute: null,
      roundDurationLabel: '5 хв',
      lexiconSuffix: null,
    });
    expect(label).toBe('Базове слово: ПОРТ · Тривалість: 5 хв');
  });

  it('returns null when nothing to show', () => {
    expect(
      formatResultsSharedMetaLabel(t, {
        showBaseWordInMeta: false,
        baseWordDisplay: 'ПОРТ',
        wordsPerMinute: null,
        roundDurationLabel: null,
        lexiconSuffix: null,
      }),
    ).toBeNull();
  });
});

describe('formatResultsVisibleWordsCaption', () => {
  it('formats visible vs max with Ukrainian plural from visible count', () => {
    expect(
      formatResultsVisibleWordsCaption(t, {
        visibleCount: 36,
        maxPlayableWords: 1224,
      }),
    ).toBe('36\u00A0слів з 1224');
  });

  it('uses full lexicon when all words are shown', () => {
    expect(
      formatResultsVisibleWordsCaption(t, {
        visibleCount: 1224,
        maxPlayableWords: 1224,
      }),
    ).toBe('1224\u00A0слова з 1224');
  });

  it('falls back to pluralized count when max unknown', () => {
    const label = formatResultsVisibleWordsCaption(t, {
      visibleCount: 3,
      maxPlayableWords: null,
    });
    expect(label).toMatch(/3/);
    expect(label).toMatch(/слова/);
  });
});
