import { ukPluralForm } from '@/lib/i18n/uk-plural';

function formatUkCollectedWords(count: number): string {
  const form = ukPluralForm(count);
  if (form === 'one') {
    return `${count} зібране слово`;
  }
  if (form === 'few') {
    return `${count} зібрані слова`;
  }
  return `${count} зібраних слів`;
}

/** «8 ігор · 8 перемог» */
export function formatProfileStatsGamesLine(gamesPlayed: number, gamesWon: number): string {
  return `${gamesPlayed} ігор · ${gamesWon} перемог`;
}

/** «185 зібраних слів» */
export function formatProfileStatsWordsLine(wordsCollected: number): string {
  return formatUkCollectedWords(wordsCollected);
}

/** Single line — e.g. history stats band. */
export function formatProfileStatsSummary(
  gamesPlayed: number,
  gamesWon: number,
  wordsCollected: number,
): string {
  return `${formatProfileStatsGamesLine(gamesPlayed, gamesWon)} · ${formatProfileStatsWordsLine(wordsCollected)}`;
}
