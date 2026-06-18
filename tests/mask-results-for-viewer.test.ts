import { describe, expect, it } from 'vitest';

import { maskResultsForEarlyExit } from '../lib/online/mask-results-for-viewer.js';
import type { RoundResultsViewData } from '../lib/online/online-results-data.js';

const t = (key: string) => (key === 'game.wordsHiddenPlaceholder' ? '***' : key);

function viewData(): RoundResultsViewData {
  return {
    headline: 'winner',
    baseWordDisplay: 'ПОРТ',
    totalDistinctWords: 2,
    standings: [],
    uniqueBonusEnabled: true,
    roundDurationSeconds: 600,
    globalWords: [
      {
        normalized: 'рот',
        display: 'РОТ',
        showX2: true,
        authors: [
          {
            playerId: 'p1',
            playerName: 'Аня',
            avatarColorIndex: 0,
            kind: 'unique',
          },
        ],
      },
      {
        normalized: 'тор',
        display: 'ТОР',
        showX2: false,
        authors: [
          {
            playerId: 'p2',
            playerName: 'Богдан',
            avatarColorIndex: 1,
            kind: 'normal',
          },
        ],
      },
    ],
    playerRankGroups: [
      {
        rank: 1,
        isTopRank: true,
        players: [
          {
            playerId: 'p1',
            playerName: 'Аня',
            avatarColorIndex: 0,
            rank: 1,
            score: 2,
            wordCount: 1,
            uniqueCount: 1,
            words: [{ display: 'РОТ', badge: 'x2', overlapPeers: [] }],
            wordsPerMinute: 1,
            isTopRank: true,
          },
          {
            playerId: 'p2',
            playerName: 'Богдан',
            avatarColorIndex: 1,
            rank: 2,
            score: 1,
            wordCount: 1,
            uniqueCount: 0,
            words: [{ display: 'ТОР', badge: null, overlapPeers: [] }],
            wordsPerMinute: 1,
            isTopRank: false,
          },
        ],
      },
    ],
  };
}

describe('maskResultsForEarlyExit', () => {
  it('keeps only the viewer words in the global list', () => {
    const masked = maskResultsForEarlyExit(viewData(), 'p1', t);
    expect(masked.globalWords).toHaveLength(1);
    expect(masked.globalWords[0]?.authors[0]?.playerId).toBe('p1');
    expect(masked.totalDistinctWords).toBe(1);
  });

  it('hides other players word lists in rank groups', () => {
    const masked = maskResultsForEarlyExit(viewData(), 'p1', t);
    const peer = masked.playerRankGroups[0]?.players.find((p) => p.playerId === 'p2');
    expect(peer?.words).toEqual([{ display: '***', badge: null, overlapPeers: [] }]);
    expect(peer?.uniqueCount).toBe(0);
  });
});
