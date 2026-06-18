import type { GlobalResultWordRow, PlayerResultRankGroup } from '../game/results-view.js';
import type { RoundResultsViewData } from './online-results-data.js';

type TranslateFn = (key: string) => string;

/**
 * Hide other players' words for someone who left the round early.
 */
export function maskResultsForEarlyExit(
  viewData: RoundResultsViewData,
  viewerId: string,
  t: TranslateFn,
): RoundResultsViewData {
  const hiddenWord = t('game.wordsHiddenPlaceholder');

  const globalWords: GlobalResultWordRow[] = viewData.globalWords
    .map((row) => {
      const mineOnly = row.authors.every((author) => author.playerId === viewerId);
      if (!mineOnly) {
        return null;
      }
      return row;
    })
    .filter((row): row is GlobalResultWordRow => row != null);

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
