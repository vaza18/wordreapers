import { describe, expect, it } from 'vitest';

import type { FinishedRoundArchive } from '@/lib/online/online-session-archive';
import { sumArchivedWordCountForPlayer } from '@/lib/online/sum-archived-word-count';

describe('sumArchivedWordCountForPlayer', () => {
  it('sums wordCount for one uid across archives', () => {
    const archives: FinishedRoundArchive[] = [
      {
        gameId: 'ABCD',
        baseWordRound: 0,
        savedAt: 1,
        session: {
          baseWord: 'тест',
          status: 'finished',
          settings: {
            durationSeconds: 600,
            uniqueBonusEnabled: false,
            language: 'uk-uk',
            allowProperNouns: false,
            allowSlang: false,
          },
          timerEndsAt: null,
          organizerId: 'uid-a',
          players: {
            'uid-a': { name: 'A', wordCount: 12, score: 10, online: true },
          },
        },
        playerWords: {},
      },
      {
        gameId: 'WXYZ',
        baseWordRound: 0,
        savedAt: 2,
        session: {
          baseWord: 'тест',
          status: 'finished',
          settings: {
            durationSeconds: 600,
            uniqueBonusEnabled: false,
            language: 'uk-uk',
            allowProperNouns: false,
            allowSlang: false,
          },
          timerEndsAt: null,
          organizerId: 'uid-a',
          players: {
            'uid-a': { name: 'A', wordCount: 7, score: 5, online: true },
          },
        },
        playerWords: {},
      },
    ];

    expect(sumArchivedWordCountForPlayer(archives, 'uid-a')).toBe(19);
  });
});
