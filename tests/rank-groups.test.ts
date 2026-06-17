import { describe, expect, it } from 'vitest';

import { createLocalResultsDirectory } from '../lib/game/results-directory.js';
import { formatResultsHeadline } from '../lib/game/results-headline.js';
import {
  getTopRankGroup,
  groupStandingsByDisplayRank,
  isFullStandingsTie,
} from '../lib/game/rank-groups.js';
import type { PlayerStandings } from '../lib/game/scoring.js';

const row = (
  playerId: string,
  score: number,
  wordCount: number,
  uniqueCount = 0,
): PlayerStandings => ({ playerId, score, wordCount, uniqueCount });

const t = (key: string, params?: Record<string, string | number>) => {
  const table: Record<string, string> = {
    'game.resultsTitle': 'Гра завершена',
    'game.resultsTieHeadline': `Нічия · ${params?.score} · ${params?.words}`,
    'game.resultsSoloHeadline': `Solo · ${params?.score} · ${params?.words}`,
    'game.resultsCoWinnersHeadline': `Co: ${params?.names}`,
    'game.winnerLineNeutral': `Win: ${params?.name}`,
    'game.defaultPlayerName': `P${params?.index}`,
  };
  return table[key] ?? key;
};

describe('groupStandingsByDisplayRank', () => {
  it('puts all zero-score players in one rank-1 group', () => {
    const standings = [row('player-0', 0, 0), row('player-1', 0, 0)];
    const groups = groupStandingsByDisplayRank(standings);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rank).toBe(1);
    expect(groups[0]?.members).toHaveLength(2);
    expect(isFullStandingsTie(standings)).toBe(true);
  });

  it('splits second place ties into one tier', () => {
    const standings = [row('player-0', 5, 3), row('player-1', 3, 2), row('player-2', 3, 2)];
    const groups = groupStandingsByDisplayRank(standings);
    expect(groups.map((group) => group.rank)).toEqual([1, 2]);
    expect(groups[1]?.members).toHaveLength(2);
    expect(getTopRankGroup(standings)?.members).toHaveLength(1);
  });
});

describe('formatResultsHeadline', () => {
  it('shows solo quip for a single player', () => {
    const standings = [row('player-0', 2, 1)];
    const directory = createLocalResultsDirectory(['Сим'], undefined, t);
    expect(formatResultsHeadline(t, directory, standings)).toBe('Solo · 2 · 1');
  });

  it('shows tie when everyone has the same score', () => {
    const standings = [row('player-0', 0, 0), row('player-1', 0, 0)];
    const directory = createLocalResultsDirectory(['А', 'Б'], undefined, t);
    expect(formatResultsHeadline(t, directory, standings)).toBe('Нічия · 0 · 0');
  });

  it('lists co-winners only when score and word count match', () => {
    const standings = [row('player-0', 4, 2), row('player-1', 4, 2), row('player-2', 1, 1)];
    const directory = createLocalResultsDirectory(['Юля', 'Артем', 'Василь'], undefined, t);
    expect(formatResultsHeadline(t, directory, standings)).toBe('Co: Юля · Артем');
  });

  it('picks single leader when score ties but word count differs', () => {
    const standings = [row('player-1', 2, 2), row('player-0', 2, 1)];
    expect(isFullStandingsTie(standings)).toBe(false);
    expect(getTopRankGroup(standings)?.members).toHaveLength(1);
    expect(getTopRankGroup(standings)?.members[0]?.playerId).toBe('player-1');
  });
});
