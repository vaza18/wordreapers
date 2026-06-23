import type { GlobalResultWordRow } from '@/lib/game/results-view';
import type { RoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon';

/** One row in the results «Всі слова» list (found or missed). */
export interface ResultsWordListRow {
  normalized: string;
  display: string;
  found: boolean;
  authors?: GlobalResultWordRow['authors'];
  showX2?: boolean;
}

/**
 * Merge round lexicon with scored global words for the «Всі слова» tab.
 */
export function buildResultsWordList(
  globalWords: readonly GlobalResultWordRow[],
  lexicon: RoundPlayableLexicon | null,
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

  for (const normalized of [...lexicon.words].sort((a, b) => a.localeCompare(b, 'uk'))) {
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
        display: lexicon.displays.get(normalized) ?? normalized.toUpperCase(),
        found: false,
      });
    }
  }

  return rows;
}
