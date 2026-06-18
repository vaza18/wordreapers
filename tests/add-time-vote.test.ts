import { describe, expect, it } from 'vitest';

import type { AddTimeVote, GameSession } from '../lib/firebase/types.js';
import { EARLY_FINISH_VOTE_TIMEOUT_MS } from '../lib/online/early-finish-vote.js';
import {
  shouldApplyAddTimeFromVote,
  shouldClearAddTimeVote,
  viewerNeedsAddTimeVote,
} from '../lib/online/add-time-vote.js';

function session(players: GameSession['players']): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
  };
}

const addTimeVote: AddTimeVote = {
  proposedBy: 'org',
  proposedAt: 1_000_000,
  addMinutes: 5,
  votes: { org: 'yes' },
};

describe('add time vote', () => {
  it('requires only online opponents still in the round', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
      b: { name: 'B', wordCount: 0, score: 0, online: false },
    });
    expect(viewerNeedsAddTimeVote(s, addTimeVote, 'a')).toBe(true);
    expect(viewerNeedsAddTimeVote(s, addTimeVote, 'b')).toBe(false);
    expect(viewerNeedsAddTimeVote(s, addTimeVote, 'org')).toBe(false);
  });

  it('applies add time when all required voters agreed', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    const agreed = { ...addTimeVote, votes: { org: 'yes', a: 'yes' } as const };
    expect(shouldApplyAddTimeFromVote(s, agreed)).toBe(true);
  });

  it('clears vote after timeout when nobody rejected', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    expect(
      shouldClearAddTimeVote(
        s,
        addTimeVote,
        addTimeVote.proposedAt! + EARLY_FINISH_VOTE_TIMEOUT_MS,
      ),
    ).toBe(true);
  });

  it('clears vote when an online opponent voted no', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    const rejected = { ...addTimeVote, votes: { org: 'yes', a: 'no' } as const };
    expect(shouldClearAddTimeVote(s, rejected, addTimeVote.proposedAt! + 1000)).toBe(true);
  });
});
