import { describe, expect, it } from 'vitest';

import {
  assignDisplayRanks,
  buildPlayerTotalsUpdatePatch,
  buildStandings,
  compareStandings,
  computePlayerScore,
  displayRankForPlayer,
  recomputeSessionPlayerScores,
  recomputeWordScores,
  resolveUniqueBonusEnabled,
  shouldShowPointUi,
  toScoredWordEntry,
} from '../lib/game/scoring.js';
import type { PlayerStandings } from '../lib/game/scoring.js';

describe('resolveUniqueBonusEnabled', () => {
  it('auto enables unique bonus for 3+ players', () => {
    expect(resolveUniqueBonusEnabled('auto', 2)).toBe(false);
    expect(resolveUniqueBonusEnabled('auto', 3)).toBe(true);
  });

  it('respects explicit off', () => {
    expect(resolveUniqueBonusEnabled('off', 4)).toBe(false);
  });
});

describe('shouldShowPointUi', () => {
  it('mirrors unique bonus enabled', () => {
    expect(shouldShowPointUi(false)).toBe(false);
    expect(shouldShowPointUi(true)).toBe(true);
  });
});

describe('unique bonus scoring', () => {
  it('gives x2 to unique words and +N to shared when bonus is on', () => {
    const wordsByPlayer = new Map([
      ['p1', ['порт', 'рот']],
      ['p2', ['порт', 'метр']],
    ]);

    const scored = recomputeWordScores(wordsByPlayer, true);
    expect(scored.get('p1')).toEqual([
      toScoredWordEntry('порт', 'normal', true, 2),
      toScoredWordEntry('рот', 'unique', true, 1),
    ]);
    expect(scored.get('p2')).toEqual([
      toScoredWordEntry('порт', 'normal', true, 2),
      toScoredWordEntry('метр', 'unique', true, 1),
    ]);
    expect(computePlayerScore(scored.get('p1') ?? [])).toBe(3);
    expect(computePlayerScore(scored.get('p2') ?? [])).toBe(3);
  });
});

describe('bonus off scoring', () => {
  it('gives 1 point to all words and +N badge only on shared', () => {
    const wordsByPlayer = new Map([
      ['p1', ['порт', 'рот']],
      ['p2', ['порт', 'метр']],
    ]);

    const scored = recomputeWordScores(wordsByPlayer, false);
    expect(scored.get('p1')).toEqual([
      toScoredWordEntry('порт', 'normal', false, 2),
      toScoredWordEntry('рот', 'unique', false, 1),
    ]);
    expect(scored.get('p2')).toEqual([
      toScoredWordEntry('порт', 'normal', false, 2),
      toScoredWordEntry('метр', 'unique', false, 1),
    ]);
    expect(scored.get('p1')?.[0]?.badge).toBe('+1');
    expect(scored.get('p1')?.[1]?.badge).toBeNull();
  });
});

describe('assignDisplayRanks', () => {
  const row = (
    playerId: string,
    score: number,
    wordCount: number,
    uniqueCount = 0,
  ): PlayerStandings => ({ playerId, score, wordCount, uniqueCount });

  it('gives rank 1 to all players with equal score and word count', () => {
    const standings = [row('p1', 0, 0), row('p2', 0, 0)];
    const ranks = assignDisplayRanks(standings);
    expect(ranks.get('p1')).toBe(1);
    expect(ranks.get('p2')).toBe(1);
    expect(displayRankForPlayer(standings, 'p1')).toBe(1);
    expect(displayRankForPlayer(standings, 'p2')).toBe(1);
  });

  it('uses dense ranks when scores differ', () => {
    const standings = [row('p1', 5, 3), row('p2', 3, 2), row('p3', 3, 2)];
    const ranks = assignDisplayRanks(standings);
    expect(ranks.get('p1')).toBe(1);
    expect(ranks.get('p2')).toBe(2);
    expect(ranks.get('p3')).toBe(2);
  });

  it('splits rank when score is equal but word count differs', () => {
    const standings = [row('player-1', 2, 2), row('player-0', 2, 1), row('player-2', 0, 1)];
    const ranks = assignDisplayRanks(standings);
    expect(ranks.get('player-1')).toBe(1);
    expect(ranks.get('player-0')).toBe(2);
    expect(ranks.get('player-2')).toBe(3);
  });
});

describe('compareStandings', () => {
  const row = (playerId: string, score: number, wordCount: number): PlayerStandings => ({
    playerId,
    score,
    wordCount,
    uniqueCount: 0,
  });

  it('ranks higher score first, then more words at equal score', () => {
    const ordered = [row('p1', 2, 1), row('p2', 2, 2), row('p3', 0, 1)].sort(compareStandings);
    expect(ordered.map((entry) => entry.playerId)).toEqual(['p2', 'p1', 'p3']);
  });
});

describe('buildStandings', () => {
  it('orders by total score', () => {
    const wordsByPlayer = new Map([
      ['p1', ['порт', 'рот']],
      ['p2', ['метр']],
      ['p3', ['порт']],
    ]);

    const standings = buildStandings(wordsByPlayer, true);
    expect(standings.map((row) => row.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(standings[0]?.score).toBe(3);
  });
});

describe('recomputeSessionPlayerScores', () => {
  it('applies x2 to solo words when bonus turns on for 3+ players', () => {
    const session = {
      players: {
        org: { score: 3, wordCount: 3 },
        p2: { score: 1, wordCount: 1 },
        p3: { score: 0, wordCount: 0 },
      },
      wordPlayers: {
        вада: { org: true },
        вал: { org: true },
        ванна: { org: true },
        рот: { org: true, p2: true },
      },
    };

    recomputeSessionPlayerScores(session, true);

    expect(session.players.org?.score).toBe(7);
    expect(session.players.org?.wordCount).toBe(4);
    expect(session.players.p2?.score).toBe(1);
  });

  it('builds leaf score/wordCount patches without a players object rewrite', () => {
    expect(
      buildPlayerTotalsUpdatePatch(
        {
          org: { score: 4, wordCount: 3 },
          guest: { score: 1, wordCount: 1 },
        },
        {
          org: { score: 1, wordCount: 3 },
          guest: { score: 1, wordCount: 1 },
        },
      ),
    ).toEqual({ 'players/org/score': 4 });
  });
});
