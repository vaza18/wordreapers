import { describe, expect, it } from 'vitest';

import type { GameSession, SessionVote } from '../lib/firebase/types.js';
import { viewerNeedsSessionVote } from '../lib/online/voting/viewer-needs-session-vote.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

const session: GameSession = {
  baseWord: 'тест',
  status: 'playing',
  settings: DEFAULT_SESSION_SETTINGS,
  timerEndsAt: 1,
  organizerId: 'org',
  players: {
    org: { name: 'Org', wordCount: 0, score: 0 },
    guest: { name: 'Guest', wordCount: 0, score: 0 },
  },
};

const vote: SessionVote = {
  proposedBy: 'org',
  votes: { org: 'yes' },
};

describe('viewerNeedsSessionVote', () => {
  const required = () => ['org', 'guest'];

  it('returns false for the proposer', () => {
    expect(viewerNeedsSessionVote(session, vote, 'org', required)).toBe(false);
  });

  it('returns true when viewer must vote', () => {
    expect(viewerNeedsSessionVote(session, vote, 'guest', required)).toBe(true);
  });

  it('returns false after viewer voted', () => {
    const voted: SessionVote = { ...vote, votes: { ...vote.votes, guest: 'no' } };
    expect(viewerNeedsSessionVote(session, voted, 'guest', required)).toBe(false);
  });

  it('returns false when viewer is not in required set', () => {
    expect(viewerNeedsSessionVote(session, vote, 'guest', () => ['org'])).toBe(false);
  });
});
