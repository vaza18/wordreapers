import { formatWinnerHeadline } from './grammar.js';
import { getTopRankGroup, isFullStandingsTie } from './rank-groups.js';
import type { ResultsPlayerDirectory } from './results-directory.js';
import type { PlayerStandings } from './scoring.js';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Results headline: single winner, co-winners, or full tie.
 */
export function formatResultsHeadline(
  t: TranslateFn,
  directory: ResultsPlayerDirectory,
  standings: readonly PlayerStandings[],
): string {
  const top = getTopRankGroup(standings);
  if (!top || top.members.length === 0) {
    return t('game.resultsTitle');
  }

  const representative = top.members[0];
  if (!representative) {
    return t('game.resultsTitle');
  }

  const score = representative.score;
  const words = representative.wordCount;

  if (standings.length === 1) {
    return t('game.resultsSoloHeadline', { score, words });
  }

  if (isFullStandingsTie(standings)) {
    return t('game.resultsTieHeadline', { score, words });
  }

  if (top.members.length > 1) {
    const names = top.members.map((member) => directory.getName(member.playerId)).join(' · ');
    return t('game.resultsCoWinnersHeadline', { names, score, words });
  }

  const winner = top.members[0];
  if (!winner) {
    return t('game.resultsTitle');
  }

  return formatWinnerHeadline(t, directory.getGender(winner.playerId), {
    name: directory.getName(winner.playerId),
    score,
    words,
  });
}
