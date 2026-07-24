import { describe, expect, it } from 'vitest';

import { clearLocalSessionVoteField } from '../lib/online/voting/clear-local-session-vote.js';
import type { GameSessionSnapshot } from '../lib/firebase/game-session-service.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

function snap(partial: Partial<GameSessionSnapshot>): GameSessionSnapshot {
  return {
    id: 'ABCDE',
    baseWord: 'тест',
    status: 'playing',
    settings: DEFAULT_SESSION_SETTINGS,
    timerEndsAt: 1,
    organizerId: 'a',
    players: {},
    ...partial,
  };
}

describe('clearLocalSessionVoteField', () => {
  it('clears only the requested vote field', () => {
    const session = snap({
      pauseVote: { proposedBy: 'a', proposedAt: 1, votes: { a: 'yes' } },
      earlyFinishVote: { proposedBy: 'b', proposedAt: 1, votes: { b: 'yes' } },
    });
    const next = clearLocalSessionVoteField(session, 'pauseVote');
    expect(next.pauseVote).toBeNull();
    expect(next.earlyFinishVote).toEqual(session.earlyFinishVote);
  });
});
