import { describe, expect, it } from 'vitest';

import type { GameSession, SessionVote } from '../lib/firebase/types.js';
import {
  allRequiredVotedYes,
  anyRequiredVotedNo,
  buildEarlyFinishParticipantRows,
  earlyFinishRequiredVoterIds,
  EARLY_FINISH_VOTE_TIMEOUT_MS,
  earlyFinishVoteExpired,
  shouldFinishFromEarlyVote,
  viewerNeedsEarlyFinishVote,
} from '../lib/online/early-finish-vote.js';

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

const vote: SessionVote = {
  proposedBy: 'org',
  proposedAt: 1_000_000,
  votes: { org: 'yes' },
};

describe('earlyFinishRequiredVoterIds', () => {
  it('includes only online opponents still in the round', () => {
    const ids = earlyFinishRequiredVoterIds(
      session({
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: true },
        b: { name: 'B', wordCount: 0, score: 0, online: false },
      }),
      'org',
    );
    expect(ids).toEqual(['a']);
  });

  it('excludes players who left even if still marked online', () => {
    const ids = earlyFinishRequiredVoterIds(
      session({
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: {
          name: 'A',
          wordCount: 0,
          score: 0,
          online: true,
          hasLeft: true,
        },
      }),
      'org',
    );
    expect(ids).toEqual([]);
  });
});

describe('shouldFinishFromEarlyVote', () => {
  it('finishes when all online opponents voted yes', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    const activeVote = { ...vote, votes: { org: 'yes', a: 'yes' } as const };
    expect(shouldFinishFromEarlyVote(s, activeVote, 1_000_100)).toBe(true);
  });

  it('does not finish when an online opponent voted no', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    const activeVote = { ...vote, votes: { org: 'yes', a: 'no' } as const };
    expect(
      shouldFinishFromEarlyVote(s, activeVote, vote.proposedAt! + EARLY_FINISH_VOTE_TIMEOUT_MS),
    ).toBe(false);
    expect(anyRequiredVotedNo(activeVote, ['a'])).toBe(true);
  });

  it('finishes after timeout when nobody rejected', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    expect(
      shouldFinishFromEarlyVote(s, vote, vote.proposedAt! + EARLY_FINISH_VOTE_TIMEOUT_MS),
    ).toBe(true);
    expect(earlyFinishVoteExpired(vote, vote.proposedAt! + EARLY_FINISH_VOTE_TIMEOUT_MS)).toBe(
      true,
    );
    expect(allRequiredVotedYes(vote, ['a'])).toBe(false);
  });
});

describe('viewerNeedsEarlyFinishVote', () => {
  it('is false for proposer, offline, and players who left', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
      b: { name: 'B', wordCount: 0, score: 0, online: false },
      c: {
        name: 'C',
        wordCount: 0,
        score: 0,
        online: true,
        hasLeft: true,
      },
    });
    expect(viewerNeedsEarlyFinishVote(s, vote, 'org')).toBe(false);
    expect(viewerNeedsEarlyFinishVote(s, vote, 'a')).toBe(true);
    expect(viewerNeedsEarlyFinishVote(s, vote, 'b')).toBe(false);
    expect(viewerNeedsEarlyFinishVote(s, vote, 'c')).toBe(false);
  });
});

describe('buildEarlyFinishParticipantRows', () => {
  it('marks offline players as not required', () => {
    const rows = buildEarlyFinishParticipantRows(
      session({
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: true },
        b: { name: 'B', wordCount: 0, score: 0, online: false },
      }),
      vote,
    );
    expect(rows.find((row) => row.playerId === 'org')?.voteStatus).toBe('yes');
    expect(rows.find((row) => row.playerId === 'a')?.voteStatus).toBe('pending');
    expect(rows.find((row) => row.playerId === 'b')?.voteStatus).toBe('not_required');
  });

  it('lists players who left as not required', () => {
    const rows = buildEarlyFinishParticipantRows(
      session({
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: {
          name: 'A',
          wordCount: 0,
          score: 0,
          online: true,
          hasLeft: true,
        },
      }),
      vote,
    );
    expect(rows.find((row) => row.playerId === 'a')?.voteStatus).toBe('not_required');
    expect(rows.find((row) => row.playerId === 'a')?.hasLeft).toBe(true);
  });
});

describe('shouldFinishFromEarlyVote when others left', () => {
  it('finishes when no online opponents remain in the round', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: {
        name: 'A',
        wordCount: 0,
        score: 0,
        online: true,
        hasLeft: true,
      },
    });
    expect(shouldFinishFromEarlyVote(s, vote, vote.proposedAt! + 1)).toBe(true);
  });
});
