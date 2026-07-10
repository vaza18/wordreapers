import { beforeEach, describe, expect, it, vi } from 'vitest';

const SERVER_NOW = 1_000_000;
const getMock = vi.fn();
const runTransactionMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => SERVER_NOW,
}));

import type { GameSession } from '../lib/firebase/types.js';
import {
  cancelAddTimeVote,
  cancelEarlyFinishVote,
  cancelPauseVote,
  cancelResumeVote,
  proposeAddTime,
  proposeEarlyFinish,
  proposePause,
  proposeResume,
  resolveAddTimeVoteIfExpired,
  resolveEarlyFinishVoteIfExpired,
  resolveResumeVoteIfExpired,
  reconcileOpenSessionVotes,
  voteAddTime,
  voteEarlyFinish,
  votePause,
  voteResume,
  voteProposerName,
} from '../lib/firebase/session-votes-service.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

function playingSession(
  players: GameSession['players'],
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: DEFAULT_SESSION_SETTINGS,
    timerEndsAt: SERVER_NOW + 120_000,
    organizerId: 'org',
    players,
    ...extra,
  };
}

function installSession(session: GameSession | null): void {
  getMock.mockResolvedValue({
    exists: () => session != null,
    val: () => session,
  });
  runTransactionMock.mockImplementation(
    async (_ref: unknown, updater: (current: unknown) => unknown) => {
      if (!session) {
        return { committed: false, snapshot: { val: () => null } };
      }
      const next = updater(session);
      if (next !== undefined) {
        session = next as GameSession;
        return { committed: true, snapshot: { val: () => session } };
      }
      return { committed: false, snapshot: { val: () => session } };
    },
  );
}

describe('session-votes-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finishes immediately when proposing early finish with no online opponents', async () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    });
    installSession(session);

    await proposeEarlyFinish('ABCD', 'org');

    expect(session.status).toBe('finished');
    expect(session.finishedAt).toBe(SERVER_NOW);
    expect(session.earlyFinishVote).toBeNull();
  });

  it('creates an early-finish vote when opponents are online', async () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
    });
    installSession(session);

    await proposeEarlyFinish('ABCD', 'org');

    expect(session.status).toBe('playing');
    expect(session.earlyFinishVote).toEqual({
      proposedBy: 'org',
      proposedAt: SERVER_NOW,
      votes: { org: 'yes' },
    });
  });

  it('finishes the round when all required opponents vote yes', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        earlyFinishVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW - 5_000,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await voteEarlyFinish('ABCD', 'guest', 'yes');

    expect(session.status).toBe('finished');
    expect(session.earlyFinishVote).toBeNull();
  });

  it('clears early-finish vote when an opponent votes no', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        earlyFinishVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW - 5_000,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await voteEarlyFinish('ABCD', 'guest', 'no');

    expect(session.status).toBe('playing');
    expect(session.earlyFinishVote).toBeNull();
  });

  it('cancels early-finish vote for the proposer only', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        earlyFinishVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await cancelEarlyFinishVote('ABCD', 'org');

    expect(session.earlyFinishVote).toBeNull();
  });

  it('resolves expired early-finish vote by finishing the round', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        earlyFinishVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW - 60_000,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await resolveEarlyFinishVoteIfExpired('ABCD');

    expect(session.status).toBe('finished');
  });

  it('applies add-time immediately when no opponents remain', async () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    });
    const endsAt = session.timerEndsAt!;
    installSession(session);

    await proposeAddTime('ABCD', 'org', 2);

    expect(session.timerEndsAt).toBe(endsAt + 2 * 60_000);
    expect(session.addTimeVote).toBeNull();
  });

  it('extends timer when all opponents agree to add time', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        addTimeVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
          addMinutes: 3,
        },
      },
    );
    const endsAt = session.timerEndsAt!;
    installSession(session);

    await voteAddTime('ABCD', 'guest', 'yes');

    expect(session.timerEndsAt).toBe(endsAt + 3 * 60_000);
    expect(session.addTimeVote).toBeNull();
  });

  it('cancels add-time vote for the proposer', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        addTimeVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
          addMinutes: 2,
        },
      },
    );
    installSession(session);

    await cancelAddTimeVote('ABCD', 'org');

    expect(session.addTimeVote).toBeNull();
  });

  it('clears expired add-time vote without extending timer', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        addTimeVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW - 60_000,
          votes: { org: 'yes' },
          addMinutes: 2,
        },
      },
    );
    installSession(session);

    await resolveAddTimeVoteIfExpired('ABCD');

    expect(session.addTimeVote).toBeNull();
    expect(session.status).toBe('playing');
  });

  it('activates pause immediately when no opponents remain', async () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    });
    installSession(session);

    await proposePause('ABCD', 'org');

    expect(session.pauseState?.active).toBe(true);
    expect(session.timerEndsAt).toBeNull();
  });

  it('pauses when all opponents vote yes', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        pauseVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await votePause('ABCD', 'guest', 'yes');

    expect(session.pauseState?.active).toBe(true);
    expect(session.pauseVote).toBeNull();
  });

  it('resumes immediately when proposing resume with no opponents', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
      },
      {
        pauseState: { active: true, frozenRemainingMs: 90_000, frozenAt: SERVER_NOW - 1000 },
        timerEndsAt: null,
      },
    );
    installSession(session);

    await proposeResume('ABCD', 'org');

    expect(session.pauseState).toBeNull();
    expect(session.timerEndsAt).toBe(SERVER_NOW + 90_000);
  });

  it('resumes when all opponents agree to leave pause', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        pauseState: { active: true, frozenRemainingMs: 60_000, frozenAt: SERVER_NOW - 1000 },
        timerEndsAt: null,
        resumeVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await voteResume('ABCD', 'guest', 'yes');

    expect(session.pauseState).toBeNull();
    expect(session.timerEndsAt).toBe(SERVER_NOW + 60_000);
  });

  it('resolves expired resume vote', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        pauseState: { active: true, frozenRemainingMs: 45_000, frozenAt: SERVER_NOW - 1000 },
        timerEndsAt: null,
        resumeVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW - 60_000,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await resolveResumeVoteIfExpired('ABCD');

    expect(session.pauseState).toBeNull();
  });

  it('cancels pause and resume votes for the proposer only', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
      {
        pauseVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
        },
        resumeVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
        },
        pauseState: { active: true, frozenRemainingMs: 30_000, frozenAt: SERVER_NOW },
        timerEndsAt: null,
      },
    );
    installSession(session);

    await cancelPauseVote('ABCD', 'org');
    expect(session.pauseVote).toBeNull();

    await cancelResumeVote('ABCD', 'org');
    expect(session.resumeVote).toBeNull();
  });

  it('skips vote transactions when the session is missing', async () => {
    installSession(null);

    await proposeEarlyFinish('ABCD', 'org');

    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it('returns proposer display name for vote banners', () => {
    const session = playingSession({
      org: { name: 'Організатор', wordCount: 0, score: 0, online: true },
    });

    expect(voteProposerName(session, 'org')).toBe('Організатор');
    expect(voteProposerName(session, 'missing')).toBe('missing');
  });

  it('activates pause when the last required voter goes offline', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: false },
      },
      {
        pauseVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await reconcileOpenSessionVotes('ABCD');

    expect(session.pauseState?.active).toBe(true);
    expect(session.pauseVote).toBeNull();
  });

  it('finishes early-finish vote when the last required voter goes offline', async () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: false },
      },
      {
        earlyFinishVote: {
          proposedBy: 'org',
          proposedAt: SERVER_NOW,
          votes: { org: 'yes' },
        },
      },
    );
    installSession(session);

    await reconcileOpenSessionVotes('ABCD');

    expect(session.status).toBe('finished');
    expect(session.earlyFinishVote).toBeNull();
  });
});
