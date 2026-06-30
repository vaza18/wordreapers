import type { PlayerResultRankGroup } from '../game/results-view.js';
import type { RoundResultsViewData } from './online-results-data.js';

type TranslateFn = (key: string) => string;

/**
 * Hide words the viewer did not find and mask other players' per-player lists.
 * Co-authors on shared words stay visible — overlap is already shown during play.
 */
export function maskResultsForEarlyExit(
  viewData: RoundResultsViewData,
  viewerId: string,
  t: TranslateFn,
): RoundResultsViewData {
  const hiddenWord = t('game.wordsHiddenPlaceholder');

  const globalWords = viewData.globalWords.filter((row) =>
    row.authors.some((author) => author.playerId === viewerId),
  );

  const playerRankGroups: PlayerResultRankGroup[] = viewData.playerRankGroups.map((group) => ({
    ...group,
    players: group.players.map((section) => {
      if (section.playerId === viewerId) {
        return section;
      }
      return {
        ...section,
        words: [{ display: hiddenWord, badge: null, overlapPeers: [] }],
        uniqueCount: 0,
      };
    }),
  }));

  return {
    ...viewData,
    globalWords,
    playerRankGroups,
    totalDistinctWords: globalWords.length,
  };
}
