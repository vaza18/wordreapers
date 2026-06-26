import { ukPluralForm } from '@/lib/i18n/uk-plural';

const GAME_FORMS = {
  one: 'гра',
  few: 'гри',
  many: 'ігор',
} as const;

const WIN_FORMS = {
  one: 'перемога',
  few: 'перемоги',
  many: 'перемог',
} as const;

function formatUkGames(count: number): string {
  return `${count} ${GAME_FORMS[ukPluralForm(count)]}`;
}

function formatUkWins(count: number): string {
  return `${count} ${WIN_FORMS[ukPluralForm(count)]}`;
}

function formatUkWords(count: number): string {
  const form = ukPluralForm(count);
  if (form === 'one') {
    return `${count} слово`;
  }
  if (form === 'few') {
    return `${count} слова`;
  }
  return `${count} слів`;
}

/** «8 ігор · 3 перемоги» */
export function formatProfileStatsGamesLine(gamesPlayed: number, gamesWon: number): string {
  return `${formatUkGames(gamesPlayed)} · ${formatUkWins(gamesWon)}`;
}

/** «185 слів» */
export function formatProfileStatsWordsLine(wordsCollected: number): string {
  return formatUkWords(wordsCollected);
}

/** Single line — e.g. history stats band. */
export function formatProfileStatsSummary(
  gamesPlayed: number,
  gamesWon: number,
  wordsCollected: number,
): string {
  return `${formatProfileStatsGamesLine(gamesPlayed, gamesWon)} · ${formatProfileStatsWordsLine(wordsCollected)}`;
}
