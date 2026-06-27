import { describe, expect, it } from 'vitest';

import type { FinishedRoundArchive } from '@/lib/online/online-session-archive';
import {
  assignRoomDisplayRanks,
  buildHistoryListEntries,
  computeRoomHistoryAggregate,
  didPlayerLeadRoomAggregate,
  filterMultiplayerArchivesForGame,
} from '@/lib/online/room-history-aggregate';

function multiplayerArchive(
  gameId: string,
  baseWordRound: number,
  savedAt: number,
  players: FinishedRoundArchive['session']['players'],
  sessionOverrides: Partial<FinishedRoundArchive['session']> = {},
): FinishedRoundArchive {
  return {
    gameId,
    baseWordRound,
    savedAt,
    session: {
      baseWord: `word-${baseWordRound}`,
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
      ...sessionOverrides,
    },
    playerWords: {},
  };
}

describe('computeRoomHistoryAggregate', () => {
  it('ranks by round wins first, then total words when scores are off', () => {
    const archives = [
      multiplayerArchive('K123', 0, 100, {
        artem: { name: 'Артем', wordCount: 20, score: 40, online: true },
        vasyl: { name: 'Василь', wordCount: 30, score: 30, online: true },
      }),
      multiplayerArchive('K123', 1, 200, {
        artem: { name: 'Артем', wordCount: 25, score: 50, online: true },
        vasyl: { name: 'Василь', wordCount: 25, score: 25, online: true },
      }),
      multiplayerArchive('K123', 2, 300, {
        artem: { name: 'Артем', wordCount: 27, score: 54, online: true },
        vasyl: { name: 'Василь', wordCount: 20, score: 20, online: true },
      }),
    ];

    const aggregate = computeRoomHistoryAggregate('K123', archives);
    expect(aggregate.roundCount).toBe(3);
    expect(aggregate.uniquePlayerCount).toBe(2);
    expect(aggregate.standings[0]).toMatchObject({
      playerId: 'artem',
      roundWins: 3,
      totalWords: 72,
    });
    expect(aggregate.standings[1]).toMatchObject({
      playerId: 'vasyl',
      roundWins: 0,
      totalWords: 75,
    });
    expect(aggregate.showScores).toBe(false);
  });

  it('ranks by round wins first, then total score when auto x2 applies to 3+ players', () => {
    const threePlayerSettings = {
      durationSeconds: 600,
      uniqueBonusMode: 'auto' as const,
      uniqueBonusEnabled: true,
      language: 'uk-uk' as const,
      allowProperNouns: false,
      allowSlang: false,
    };
    const archives = [
      multiplayerArchive(
        'K123',
        0,
        100,
        {
          a: { name: 'A', wordCount: 10, score: 20, online: true },
          b: { name: 'B', wordCount: 12, score: 15, online: true },
          c: { name: 'C', wordCount: 8, score: 10, online: true },
        },
        { settings: threePlayerSettings },
      ),
      multiplayerArchive(
        'K123',
        1,
        200,
        {
          a: { name: 'A', wordCount: 8, score: 10, online: true },
          b: { name: 'B', wordCount: 12, score: 25, online: true },
          c: { name: 'C', wordCount: 6, score: 8, online: true },
        },
        { settings: threePlayerSettings },
      ),
    ];

    const aggregate = computeRoomHistoryAggregate('K123', archives);
    expect(aggregate.showScores).toBe(true);
    expect(aggregate.standings[0]).toMatchObject({
      playerId: 'b',
      roundWins: 1,
      totalScore: 40,
      totalWords: 24,
    });
    expect(aggregate.standings[1]).toMatchObject({
      playerId: 'a',
      roundWins: 1,
      totalScore: 30,
      totalWords: 18,
    });
    expect(aggregate.standings[2]).toMatchObject({
      playerId: 'c',
      roundWins: 0,
      totalScore: 18,
      totalWords: 14,
    });
  });

  it('shows public aliases to other players in masked rooms', () => {
    const archives = [
      multiplayerArchive(
        'NQ29',
        1,
        200,
        {
          'uid-self': { name: 'Василь', wordCount: 3, score: 6, online: true },
          'uid-other': {
            name: 'iPad Pro 13',
            wordCount: 6,
            score: 12,
            online: true,
            publicAlias: 'Гравець 1',
          },
        },
        { identityMasked: true },
      ),
      multiplayerArchive(
        'NQ29',
        0,
        100,
        {
          'uid-self': { name: 'Василь', wordCount: 2, score: 4, online: true },
          'uid-other': {
            name: 'iPad Pro 13',
            wordCount: 5,
            score: 10,
            online: true,
            publicAlias: 'Гравець 1',
          },
        },
        { identityMasked: true },
      ),
    ];

    const aggregate = computeRoomHistoryAggregate('NQ29', archives, 'uid-self');
    expect(aggregate.standings.find((row) => row.playerId === 'uid-self')?.name).toBe('Василь');
    expect(aggregate.standings.find((row) => row.playerId === 'uid-other')?.name).toBe('Гравець 1');
  });
});

describe('buildHistoryListEntries', () => {
  it('collapses multi-round rooms and keeps single-round entries', () => {
    const archives = [
      multiplayerArchive('K123', 2, 500, {
        'uid-a': { name: 'A', wordCount: 5, score: 10, online: true },
        'uid-b': { name: 'B', wordCount: 2, score: 4, online: true },
      }),
      multiplayerArchive('K123', 1, 400, {
        'uid-a': { name: 'A', wordCount: 3, score: 6, online: true },
        'uid-b': { name: 'B', wordCount: 4, score: 8, online: true },
      }),
      multiplayerArchive('K122', 0, 300, {
        'uid-a': { name: 'A', wordCount: 1, score: 2, online: true },
        'uid-b': { name: 'B', wordCount: 2, score: 4, online: true },
      }),
      multiplayerArchive('K123', 0, 200, {
        'uid-a': { name: 'A', wordCount: 2, score: 4, online: true },
        'uid-b': { name: 'B', wordCount: 1, score: 2, online: true },
      }),
    ];

    const entries = buildHistoryListEntries(archives);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe('room');
    if (entries[0]?.kind === 'room') {
      expect(entries[0].aggregate.gameId).toBe('K123');
      expect(entries[0].aggregate.roundCount).toBe(3);
    }
    expect(entries[1]?.kind).toBe('round');
    if (entries[1]?.kind === 'round') {
      expect(entries[1].archive.gameId).toBe('K122');
    }
  });

  it('keeps solo archives separate and does not group lone multiplayer rounds', () => {
    const archives = [
      multiplayerArchive('K123', 0, 100, {
        solo: { name: 'Solo', wordCount: 5, score: 5, online: true },
      }),
      multiplayerArchive('K123', 1, 200, {
        'uid-a': { name: 'A', wordCount: 5, score: 10, online: true },
        'uid-b': { name: 'B', wordCount: 2, score: 4, online: true },
      }),
    ];

    const entries = buildHistoryListEntries(archives);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.kind === 'round')).toBe(true);
  });
});

describe('room leader helpers', () => {
  it('assigns display ranks with ties', () => {
    const standings = [
      { playerId: 'a', name: 'A', roundWins: 2, totalScore: 0, totalWords: 10 },
      { playerId: 'b', name: 'B', roundWins: 2, totalScore: 0, totalWords: 10 },
      { playerId: 'c', name: 'C', roundWins: 1, totalScore: 0, totalWords: 20 },
    ];
    const ranks = assignRoomDisplayRanks(standings);
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(2);
  });

  it('detects room leader for highlight', () => {
    const aggregate = computeRoomHistoryAggregate('K123', [
      multiplayerArchive('K123', 0, 100, {
        artem: { name: 'Артем', wordCount: 10, score: 20, online: true },
        vasyl: { name: 'Василь', wordCount: 5, score: 10, online: true },
      }),
      multiplayerArchive('K123', 1, 200, {
        artem: { name: 'Артем', wordCount: 10, score: 20, online: true },
        vasyl: { name: 'Василь', wordCount: 5, score: 10, online: true },
      }),
    ]);
    expect(didPlayerLeadRoomAggregate('artem', aggregate)).toBe(true);
    expect(didPlayerLeadRoomAggregate('vasyl', aggregate)).toBe(false);
  });
});

describe('filterMultiplayerArchivesForGame', () => {
  it('returns newest-first multiplayer archives for one room', () => {
    const archives = [
      multiplayerArchive('K123', 0, 100, {
        'uid-a': { name: 'A', wordCount: 5, score: 10, online: true },
        'uid-b': { name: 'B', wordCount: 2, score: 4, online: true },
      }),
      multiplayerArchive('K122', 0, 50, {
        'uid-a': { name: 'A', wordCount: 1, score: 2, online: true },
        'uid-b': { name: 'B', wordCount: 2, score: 4, online: true },
      }),
      multiplayerArchive('K123', 1, 200, {
        'uid-a': { name: 'A', wordCount: 3, score: 6, online: true },
        'uid-b': { name: 'B', wordCount: 4, score: 8, online: true },
      }),
    ];

    const filtered = filterMultiplayerArchivesForGame(archives, 'K123');
    expect(filtered).toHaveLength(2);
    expect(filtered[0]?.baseWordRound).toBe(1);
    expect(filtered[1]?.baseWordRound).toBe(0);
  });
});
