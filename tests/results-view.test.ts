import { describe, expect, it } from 'vitest';

import { createOnlineResultsDirectory } from '../lib/game/results-directory.js';
import { buildGlobalResultWords, buildPlayerResultRankGroups } from '../lib/game/results-view.js';
import type { PlayerStandings } from '../lib/game/scoring.js';

function directoryFromNames(names: Record<string, string>) {
  const players = Object.fromEntries(
    Object.entries(names).map(([id, name]) => [
      id,
      { name, wordCount: 0, score: 0, avatarColorIndex: 0 },
    ]),
  );
  return createOnlineResultsDirectory({
    baseWord: 'порт',
    status: 'finished',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'p1',
    players,
  });
}

describe('buildGlobalResultWords', () => {
  it('aggregates authors and sorts alphabetically', () => {
    const wordsByPlayer = new Map([
      ['p1', ['рот']],
      ['p2', ['рот', 'тор']],
    ]);
    const displaysByPlayer = new Map([
      ['p1', ['РОТ']],
      ['p2', ['РОТ', 'ТОР']],
    ]);
    const standings: PlayerStandings[] = [
      { playerId: 'p1', score: 3, wordCount: 2, uniqueCount: 2 },
      { playerId: 'p2', score: 1, wordCount: 1, uniqueCount: 0 },
    ];
    const directory = directoryFromNames({ p1: 'Аня', p2: 'Богдан' });

    const rows = buildGlobalResultWords({
      wordsByPlayer,
      displaysByPlayer,
      directory,
      uniqueBonusEnabled: false,
    });

    expect(rows.map((row) => row.normalized)).toEqual(['рот', 'тор']);
    expect(rows[0]?.authors).toHaveLength(2);
    expect(rows[1]?.showX2).toBe(false);

    const groups = buildPlayerResultRankGroups({
      wordsByPlayer,
      displaysByPlayer,
      directory,
      uniqueBonusEnabled: false,
      standings,
    });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.players).toHaveLength(1);
    expect(groups[0]?.players[0]?.playerId).toBe('p1');
  });
});
