import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
const setMock = vi.fn();
const runTransactionMock = vi.fn();
const onDisconnectCancel = vi.fn();
const onDisconnectUpdate = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  onDisconnect: () => ({
    cancel: () => onDisconnectCancel(),
    update: (...args: unknown[]) => onDisconnectUpdate(...args),
  }),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/public-lobby-service.js', () => ({
  unpublishPublicLobby: vi.fn(),
}));

vi.mock('../lib/firebase/player-words-service.js', () => ({
  clearAllPlayerWords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  clearSessionWordMaps: vi.fn().mockResolvedValue(undefined),
  fetchSessionWordMaps: vi.fn().mockResolvedValue({ wordPlayers: {} }),
}));

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => 2_000_000,
}));

vi.mock('../lib/online/session/active-round-cache.js', () => ({
  clearAllActiveRoundCachesForGame: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/online/organizer-waiting-room.js', () => ({
  setOrganizerWaitingRoom: vi.fn(),
}));

vi.mock('../lib/firebase/session-votes-service.js', () => ({
  reconcileOpenSessionVotes: vi.fn().mockResolvedValue(undefined),
  resolveEarlyFinishVoteIfExpired: vi.fn().mockResolvedValue(undefined),
  resolveResumeVoteIfExpired: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/dictionary-service.js', () => ({
  loadBundledBaseWords: vi.fn().mockResolvedValue(['портрет', 'тест']),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org-1' }),
  getFirebaseUid: vi.fn().mockReturnValue('org-1'),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

import {
  abandonWaitingGameSession,
  beginVoluntaryLeave,
  endVoluntaryLeave,
  finishGameSessionIfExpired,
  gameSessionExists,
  leaveGameSession,
  markPlayerOffline,
  markPlayerOnline,
  organizerLeaveWaitingLobby,
  rematchFinishedSessionToWaiting,
  startGameSession,
  tryReadGameSessionSnapshot,
  voluntaryLeaveWaitingLobbyIfMember,
} from '../lib/firebase/game-session-service.js';
import { DEFAULT_SESSION_SETTINGS, finishedSession } from './helpers/game-session-fixtures.js';

const waitingSession = {
  baseWord: 'тест',
  status: 'waiting' as const,
  settings: DEFAULT_SESSION_SETTINGS,
  timerEndsAt: null,
  organizerId: 'org-1',
  players: {
    'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
  },
};

describe('game-session-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onDisconnectCancel.mockResolvedValue(undefined);
    onDisconnectUpdate.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
  });

  it('marks an existing player online and registers disconnect cleanup', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ name: 'Org', wordCount: 0, score: 0, online: false }),
    });

    await markPlayerOnline('ABCDE', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { online: true });
    expect(onDisconnectUpdate).toHaveBeenCalledWith({ online: false });
  });

  it('skips mark online while voluntary leave is in flight', async () => {
    beginVoluntaryLeave('ABCDE', 'org-1');
    try {
      await markPlayerOnline('ABCDE', 'org-1');

      expect(getMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    } finally {
      endVoluntaryLeave('ABCDE', 'org-1');
    }
  });

  it('skips mark offline while voluntary leave is in flight', async () => {
    beginVoluntaryLeave('ABCDE', 'guest');
    try {
      await markPlayerOffline('ABCDE', 'guest');

      expect(updateMock).not.toHaveBeenCalled();
    } finally {
      endVoluntaryLeave('ABCDE', 'guest');
    }
  });

  it('skips presence-unmount offline while voluntary leave is in flight', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        status: 'playing' as const,
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
        },
      }),
    });
    beginVoluntaryLeave('ABCDE', 'guest');
    try {
      await voluntaryLeaveWaitingLobbyIfMember('ABCDE', 'guest');

      expect(updateMock).not.toHaveBeenCalled();
    } finally {
      endVoluntaryLeave('ABCDE', 'guest');
    }
  });

  it('marks an existing player offline', async () => {
    await markPlayerOffline('ABCDE', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { online: false });
  });

  it('writes online:false before canceling onDisconnect so background suspension cannot strip the safety net first', async () => {
    const order: string[] = [];
    onDisconnectCancel.mockImplementation(async () => {
      order.push('cancel');
    });
    updateMock.mockImplementation(async () => {
      order.push('update');
    });

    await markPlayerOffline('ABCDE', 'org-1');

    expect(order[0]).toBe('update');
    expect(order.indexOf('update')).toBeLessThan(order.indexOf('cancel'));
  });

  it('sends the offline write even when onDisconnect cancel never resolves', async () => {
    let resolveCancel!: () => void;
    onDisconnectCancel.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve;
        }),
    );

    const pending = markPlayerOffline('ABCDE', 'org-1');
    await vi.waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(expect.anything(), { online: false });
    });

    resolveCancel();
    await pending;
  });

  it('returns null when the room snapshot is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(tryReadGameSessionSnapshot('ABCDE')).resolves.toBeNull();
  });

  it('deletes a solo waiting room when the organizer abandons it', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await abandonWaitingGameSession('ABCDE', 'org-1');

    expect(removeMock).toHaveBeenCalled();
  });

  it('organizer leave waiting lobby deletes the room when alone online', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await organizerLeaveWaitingLobby('ABCDE', 'org-1', waitingSession);

    expect(removeMock).toHaveBeenCalled();
  });

  it('marks a guest as offline and left when leaving a waiting room', async () => {
    const session = {
      ...waitingSession,
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
    };
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => session,
    });

    await leaveGameSession('ABCDE', 'guest');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
      online: false,
      hasLeft: true,
    });
  });

  it('reports whether a game session exists', async () => {
    getMock.mockResolvedValueOnce({ exists: () => true });
    await expect(gameSessionExists('ABCDE')).resolves.toBe(true);

    getMock.mockResolvedValueOnce({ exists: () => false });
    await expect(gameSessionExists('ABCDE')).resolves.toBe(false);
  });

  it('finishes an expired playing session', async () => {
    const session = {
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 1_000_000,
      organizerId: 'org-1',
      players: {
        'org-1': { name: 'Org', wordCount: 1, score: 1, online: true },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => session });
    runTransactionMock.mockImplementation(async (_ref, updater) => {
      const next = updater(session);
      if (next) {
        Object.assign(session, next);
      }
      return { committed: next != null, snapshot: { val: () => session } };
    });

    await expect(finishGameSessionIfExpired('ABCDE')).resolves.toBe(true);
    expect(session.status).toBe('finished');
  });

  it('transitions a finished session back to waiting for rematch', async () => {
    const session = finishedSession();
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => session })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ ...session, status: 'waiting' }),
      });

    await rematchFinishedSessionToWaiting('ABCDE', 'org');

    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'waiting',
        baseWordRound: 1,
      }),
    );
  });

  it('starts a waiting session when the picker has a valid base word', async () => {
    const session = {
      ...waitingSession,
      baseWord: 'портрет',
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await startGameSession('ABCDE', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        'game_sessions/ABCDE/status': 'playing',
      }),
    );
  });

  it('does not finish a playing session before the timer expires', async () => {
    const session = {
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 5_000_000,
      organizerId: 'org-1',
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await expect(finishGameSessionIfExpired('ABCDE')).resolves.toBe(false);
    expect(session.status).toBe('playing');
  });

  it('does not finish an expired session while an add-time vote is active', async () => {
    const session = {
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 1_000_000,
      organizerId: 'org-1',
      addTimeVote: {
        proposedBy: 'org-1',
        proposedAt: 1_900_000,
        addMinutes: 5,
        votes: { 'org-1': 'yes' as const },
      },
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: true },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await expect(finishGameSessionIfExpired('ABCDE')).resolves.toBe(false);
    expect(session.status).toBe('playing');
    expect(runTransactionMock).not.toHaveBeenCalled();
  });
});
