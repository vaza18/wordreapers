import { describe, expect, it } from 'vitest';

import { computeArchivedPlayerStats } from '@/lib/online/compute-archived-player-stats';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

function archive(
  gameId: string,
  players: FinishedRoundArchive['session']['players'],
): FinishedRoundArchive {
  return {
    gameId,
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
      players,
    },
    playerWords: {},
  };
}

describe('computeArchivedPlayerStats', () => {
  it('counts multiplayer wins, solo training, and words for the profile player', () => {
    const archives: FinishedRoundArchive[] = [
      archive('WIN', {
        'uid-a': { name: 'A', wordCount: 5, score: 10, online: true },
        'uid-b': { name: 'B', wordCount: 2, score: 4, online: true },
      }),
      archive('LOSS', {
        'uid-a': { name: 'A', wordCount: 1, score: 2, online: true },
        'uid-b': { name: 'B', wordCount: 4, score: 8, online: true },
      }),
      archive('SOLO', {
        solo: { name: 'Василь', wordCount: 8, score: 8, online: true },
      }),
    ];

    expect(computeArchivedPlayerStats(archives, 'uid-a', 'Василь')).toEqual({
      gamesPlayed: 3,
      gamesWon: 1,
      wordsCollected: 14,
    });
  });

  it('ignores solo archives that belong to another profile name', () => {
    const archives = [
      archive('SOLO', {
        solo: { name: 'Інший', wordCount: 3, score: 3, online: true },
      }),
    ];

    expect(computeArchivedPlayerStats(archives, 'uid-a', 'Василь')).toEqual({
      gamesPlayed: 0,
      gamesWon: 0,
      wordsCollected: 0,
    });
  });
});
