import { describe, expect, it } from 'vitest';

import type { GameSession, SessionVote } from '../lib/firebase/types.js';
import { shouldActivatePauseFromVote } from '../lib/online/voting/pause-vote.js';
import { viewerNeedsPauseVote as needsPauseVote } from '../lib/online/voting/pause-vote.js';
import { resumeVoteRequiredIds, shouldResumeFromVote } from '../lib/online/voting/resume-vote.js';
import { EARLY_FINISH_VOTE_TIMEOUT_MS } from '../lib/online/voting/early-finish-vote.js';

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

const pauseVote: SessionVote = {
  proposedBy: 'org',
  proposedAt: 1_000_000,
  votes: { org: 'yes' },
};

describe('pause vote', () => {
  it('requires only online opponents still in the round', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
      b: { name: 'B', wordCount: 0, score: 0, online: false },
    });
    expect(needsPauseVote(s, pauseVote, 'a')).toBe(true);
    expect(needsPauseVote(s, pauseVote, 'b')).toBe(false);
    expect(needsPauseVote(s, pauseVote, 'org')).toBe(false);
  });

  it('activates pause when all required voters agreed', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    const agreed = { ...pauseVote, votes: { org: 'yes', a: 'yes' } as const };
    expect(shouldActivatePauseFromVote(s, agreed)).toBe(true);
  });
});

describe('resume vote', () => {
  const resumeVote: SessionVote = {
    proposedBy: 'org',
    proposedAt: 1_000_000,
    votes: { org: 'yes' },
  };

  it('resumes after timeout when nobody rejected', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    expect(
      shouldResumeFromVote(s, resumeVote, resumeVote.proposedAt! + EARLY_FINISH_VOTE_TIMEOUT_MS),
    ).toBe(true);
  });

  it('does not resume when an online opponent voted no', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    const rejected = { ...resumeVote, votes: { org: 'yes', a: 'no' } as const };
    expect(
      shouldResumeFromVote(s, rejected, resumeVote.proposedAt! + EARLY_FINISH_VOTE_TIMEOUT_MS),
    ).toBe(false);
  });

  it('excludes players who voluntarily left from required resume voters', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: {
        name: 'A',
        wordCount: 0,
        score: 0,
        online: false,
        hasLeft: true,
      },
    });
    expect(resumeVoteRequiredIds(s, 'org')).toEqual([]);
  });
});
