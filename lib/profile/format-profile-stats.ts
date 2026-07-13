import { ukPluralForm } from '@/lib/i18n/uk-plural';
import type { CompetitionPlayerStats, TrainingPlayerStats } from '@/lib/profile/player-stats';

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

const ROUND_FORMS = {
  one: 'раунд',
  few: 'раунди',
  many: 'раундів',
} as const;

function formatUkGames(count: number): string {
  return `${count} ${GAME_FORMS[ukPluralForm(count)]}`;
}

function formatUkWins(count: number): string {
  return `${count} ${WIN_FORMS[ukPluralForm(count)]}`;
}

function formatUkRounds(count: number): string {
  return `${count} ${ROUND_FORMS[ukPluralForm(count)]}`;
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

/** Single line — e.g. legacy layouts. Prefer split formatters for profile/history. */
export function formatProfileStatsSummary(
  gamesPlayed: number,
  gamesWon: number,
  wordsCollected: number,
): string {
  return `${formatProfileStatsGamesLine(gamesPlayed, gamesWon)} · ${formatProfileStatsWordsLine(wordsCollected)}`;
}

/** «Змагання: 2 ігри · 1 перемога · 6 слів» */
export function formatCompetitionStatsLine(stats: CompetitionPlayerStats): string {
  return `Змагання: ${formatUkGames(stats.gamesPlayed)} · ${formatUkWins(stats.gamesWon)} · ${formatUkWords(stats.wordsCollected)}`;
}

/** «Тренування: 1 раунд · 8 слів» */
export function formatTrainingStatsLine(stats: TrainingPlayerStats): string {
  return `Тренування: ${formatUkRounds(stats.roundsPlayed)} · ${formatUkWords(stats.wordsCollected)}`;
}
