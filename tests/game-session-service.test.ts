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
  fetchSessionWordMaps: vi.fn().mockResolvedValue({ wordFirst: {}, wordPlayers: {} }),
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
  finishGameSessionIfExpired,
  gameSessionExists,
  leaveGameSession,
  markPlayerOffline,
  markPlayerOnline,
  organizerLeaveWaitingLobby,
  rematchFinishedSessionToWaiting,
  startGameSession,
  tryReadGameSessionSnapshot,
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

    await markPlayerOnline('ABCD', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { online: true });
    expect(onDisconnectUpdate).toHaveBeenCalledWith({ online: false });
  });

  it('skips mark online while voluntary leave is in flight', async () => {
    beginVoluntaryLeave('ABCD', 'org-1');

    await markPlayerOnline('ABCD', 'org-1');

    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('marks an existing player offline', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ name: 'Org', wordCount: 0, score: 0, online: true }),
    });

    await markPlayerOffline('ABCD', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { online: false });
  });

  it('returns null when the room snapshot is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(tryReadGameSessionSnapshot('ABCD')).resolves.toBeNull();
  });

  it('deletes a solo waiting room when the organizer abandons it', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await abandonWaitingGameSession('ABCD', 'org-1');

    expect(removeMock).toHaveBeenCalled();
  });

  it('organizer leave waiting lobby deletes the room when alone online', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await organizerLeaveWaitingLobby('ABCD', 'org-1', waitingSession);

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

    await leaveGameSession('ABCD', 'guest');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
      online: false,
      hasLeft: true,
    });
  });

  it('reports whether a game session exists', async () => {
    getMock.mockResolvedValueOnce({ exists: () => true });
    await expect(gameSessionExists('ABCD')).resolves.toBe(true);

    getMock.mockResolvedValueOnce({ exists: () => false });
    await expect(gameSessionExists('ABCD')).resolves.toBe(false);
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

    await expect(finishGameSessionIfExpired('ABCD')).resolves.toBe(true);
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

    await rematchFinishedSessionToWaiting('ABCD', 'org');

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

    await startGameSession('ABCD', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        'game_sessions/ABCD/status': 'playing',
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

    await expect(finishGameSessionIfExpired('ABCD')).resolves.toBe(false);
    expect(session.status).toBe('playing');
  });
});
