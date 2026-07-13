import i18n from '@/i18n';
import { formatUkGames, formatUkRounds, formatUkWins, formatUkWords } from '@/lib/i18n/uk-plural';
import type { CompetitionPlayerStats, TrainingPlayerStats } from '@/lib/profile/player-stats';

/** «8 ігор · 3 перемоги» */
export function formatProfileStatsGamesLine(gamesPlayed: number, gamesWon: number): string {
  return i18n.t('profileStats.gamesWonLine', {
    games: formatUkGames(gamesPlayed),
    wins: formatUkWins(gamesWon),
  });
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
  return i18n.t('profileStats.summaryLine', {
    games: formatUkGames(gamesPlayed),
    wins: formatUkWins(gamesWon),
    words: formatUkWords(wordsCollected),
  });
}

/** «Змагання: 2 ігри · 1 перемога · 6 слів» */
export function formatCompetitionStatsLine(stats: CompetitionPlayerStats): string {
  return i18n.t('profileStats.competitionLine', {
    games: formatUkGames(stats.gamesPlayed),
    wins: formatUkWins(stats.gamesWon),
    words: formatUkWords(stats.wordsCollected),
  });
}

/** «Тренування: 1 раунд · 8 слів» */
export function formatTrainingStatsLine(stats: TrainingPlayerStats): string {
  return i18n.t('profileStats.trainingLine', {
    rounds: formatUkRounds(stats.roundsPlayed),
    words: formatUkWords(stats.wordsCollected),
  });
}
