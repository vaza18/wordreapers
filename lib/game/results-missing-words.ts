import type { GlobalResultWordRow } from '@/lib/game/results-view';
import { toDisplayUpper } from '../dictionary/normalize.js';

/** Lexicon fields used when merging found words with the full playable set. */
export interface ResultsWordListLexicon {
  sortedWords: readonly string[];
  displays: ReadonlyMap<string, string>;
}

/** One row in the results «Всі слова» list (found or missed). */
export interface ResultsWordListRow {
  normalized: string;
  display: string;
  found: boolean;
  authors?: GlobalResultWordRow['authors'];
  showX2?: boolean;
}

/**
 * Gate lexicon into the results word-list memo only while missing words are shown.
 * Keeps found-only lists stable when the lexicon finishes loading in the background.
 */
export function resolveResultsWordListLexicon(
  lexicon: ResultsWordListLexicon | null | undefined,
  showMissing: boolean,
): ResultsWordListLexicon | null {
  if (!showMissing) {
    return null;
  }
  return lexicon ?? null;
}

/**
 * Merge round lexicon with scored global words for the «Всі слова» tab.
 */
export function buildResultsWordList(
  globalWords: readonly GlobalResultWordRow[],
  lexicon: ResultsWordListLexicon | null,
  showMissing: boolean,
): ResultsWordListRow[] {
  if (!showMissing || !lexicon) {
    return globalWords.map((row) => ({
      normalized: row.normalized,
      display: row.display,
      found: true,
      authors: row.authors,
      showX2: row.showX2,
    }));
  }

  const foundByNormalized = new Map(globalWords.map((row) => [row.normalized, row]));
  const rows: ResultsWordListRow[] = [];

  for (const normalized of lexicon.sortedWords) {
    const found = foundByNormalized.get(normalized);
    if (found) {
      rows.push({
        normalized: found.normalized,
        display: found.display,
        found: true,
        authors: found.authors,
        showX2: found.showX2,
      });
    } else {
      rows.push({
        normalized,
        display: lexicon.displays.get(normalized) ?? toDisplayUpper(normalized),
        found: false,
      });
    }
  }

  return rows;
}
