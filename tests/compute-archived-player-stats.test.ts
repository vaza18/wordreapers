import { describe, expect, it } from 'vitest';

import { computeArchivedPlayerStats } from '@/lib/online/compute-archived-player-stats';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

function archive(
  gameId: string,
  players: FinishedRoundArchive['session']['players'],
  playerWords: Record<string, string[]>,
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
    playerWords,
  };
}

describe('computeArchivedPlayerStats', () => {
  it('splits multiplayer competition from solo training for the profile player', () => {
    const archives: FinishedRoundArchive[] = [
      archive(
        'WIN',
        {
          'uid-a': { name: 'A', wordCount: 0, score: 0, online: true },
          'uid-b': { name: 'B', wordCount: 0, score: 0, online: true },
        },
        {
          'uid-a': ['а', 'б', 'в', 'г', 'д'],
          'uid-b': ['е', 'є'],
        },
      ),
      archive(
        'LOSS',
        {
          'uid-a': { name: 'A', wordCount: 0, score: 0, online: true },
          'uid-b': { name: 'B', wordCount: 0, score: 0, online: true },
        },
        {
          'uid-a': ['а'],
          'uid-b': ['б', 'в', 'г', 'д'],
        },
      ),
      archive(
        'SOLO',
        {
          solo: { name: 'Василь', wordCount: 0, score: 0, online: true },
        },
        { solo: ['а', 'б', 'в', 'г', 'д', 'е', 'є', 'ж'] },
      ),
    ];

    expect(computeArchivedPlayerStats(archives, 'uid-a', 'Василь')).toEqual({
      competition: { gamesPlayed: 2, gamesWon: 1, wordsCollected: 6 },
      training: { roundsPlayed: 1, wordsCollected: 8 },
    });
  });

  it('ignores solo archives that belong to another profile name', () => {
    const archives = [
      archive(
        'SOLO',
        {
          solo: { name: 'Інший', wordCount: 0, score: 0, online: true },
        },
        { solo: ['а', 'б', 'в'] },
      ),
    ];

    expect(computeArchivedPlayerStats(archives, 'uid-a', 'Василь')).toEqual({
      competition: { gamesPlayed: 0, gamesWon: 0, wordsCollected: 0 },
      training: { roundsPlayed: 0, wordsCollected: 0 },
    });
  });

  it('ignores solo archives with zero words', () => {
    const archives = [
      archive(
        'EMPTY',
        {
          solo: { name: 'Василь', wordCount: 0, score: 0, online: true },
        },
        { solo: [] },
      ),
    ];

    expect(computeArchivedPlayerStats(archives, 'uid-a', 'Василь')).toEqual({
      competition: { gamesPlayed: 0, gamesWon: 0, wordsCollected: 0 },
      training: { roundsPlayed: 0, wordsCollected: 0 },
    });
  });

  it('ignores multiplayer archives where the viewer uid is absent', () => {
    const archives = [
      archive(
        'OTHER',
        {
          'uid-b': { name: 'B', wordCount: 0, score: 0, online: true },
          'uid-c': { name: 'C', wordCount: 0, score: 0, online: true },
        },
        {
          'uid-b': ['а', 'б', 'в', 'г'],
          'uid-c': ['д', 'е'],
        },
      ),
    ];

    expect(computeArchivedPlayerStats(archives, 'uid-a', 'Василь')).toEqual({
      competition: { gamesPlayed: 0, gamesWon: 0, wordsCollected: 0 },
      training: { roundsPlayed: 0, wordsCollected: 0 },
    });
  });
});
