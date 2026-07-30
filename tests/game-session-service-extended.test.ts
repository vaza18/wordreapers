import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
const setMock = vi.fn();
const runTransactionMock = vi.fn();
const onValueMock = vi.fn();
const onDisconnectCancel = vi.fn();
const onDisconnectUpdate = vi.fn();
const fetchSessionWordMaps = vi.fn();
const ensureFirebaseAppCheck = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  onValue: (...args: unknown[]) => onValueMock(...args),
  onDisconnect: () => ({
    cancel: () => onDisconnectCancel(),
    update: (...args: unknown[]) => onDisconnectUpdate(...args),
  }),
  ref: (_db: unknown, path: string) => ({ path }),
  child: (parent: { path: string }, sub: string) => ({ path: `${parent.path}/${sub}` }),
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
  fetchSessionWordMaps: (...args: unknown[]) => fetchSessionWordMaps(...args),
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
  sessionRef: (gameId: string) => {
    const path = `game_sessions/${gameId}`;
    return {
      path,
      child: (sub: string) => ({ path: `${path}/${sub}` }),
    };
  },
}));

vi.mock('../lib/firebase/app-check.js', () => ({
  ensureFirebaseAppCheck: () => ensureFirebaseAppCheck(),
}));

import {
  beginVoluntaryLeave,
  clearSessionRootForRecreate,
  endVoluntaryLeave,
  joinGameSession,
  rejoinExistingPlayer,
  removeOrphanGameSessionShell,
  restartGameSessionForRematch,
  subscribeGameSession,
  subscribePlayerOnlinePresence,
  syncLobbyPickerState,
  syncSessionPlayerScores,
  updateGameSessionBaseWord,
  updateGameSessionSetup,
  resetSharedGameSessionSubscriptionsForTests,
} from '../lib/firebase/game-session-service.js';
import { DEFAULT_SESSION_SETTINGS, finishedSession } from './helpers/game-session-fixtures.js';

const profile = { name: 'Org', gender: 'm' as const, avatarColorIndex: 0 };

const waitingSession = {
  baseWord: 'тест',
  status: 'waiting' as const,
  settings: DEFAULT_SESSION_SETTINGS,
  timerEndsAt: null,
  organizerId: 'org-1',
  baseWordPickerOrder: ['org-1'],
  baseWordPickerUid: 'org-1',
  players: {
    'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
  },
};

describe('game-session-service extended', () => {
  beforeEach(() => {
    resetSharedGameSessionSubscriptionsForTests();
    vi.clearAllMocks();
    onDisconnectCancel.mockResolvedValue(undefined);
    onDisconnectUpdate.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
    setMock.mockResolvedValue(undefined);
    ensureFirebaseAppCheck.mockResolvedValue(undefined);
    fetchSessionWordMaps.mockResolvedValue({
      wordPlayers: { порт: { 'org-1': true } },
    });
  });

  it('rejects invalid room codes on join', async () => {
    await expect(joinGameSession('!!!', profile)).rejects.toThrow('INVALID_CODE');
  });

  it('throws ROOM_NOT_FOUND when session root is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(joinGameSession('ABCDE', profile)).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('throws ROOM_NOT_FOUND for orphan shells (no status/organizerId), not ROOM_NOT_JOINABLE', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: 'екс-держсекретар',
        baseWordChosenBy: 'org-1',
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
        },
        settings: DEFAULT_SESSION_SETTINGS,
      }),
    });

    await expect(joinGameSession('ABCDE', profile)).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('rejoins an existing player and appends live round uid while playing', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        status: 'playing',
        liveRoundPlayerUids: ['org-1'],
        players: {
          'guest-1': { name: 'Guest', wordCount: 0, score: 0, online: false, hasLeft: false },
        },
      }),
    });

    await rejoinExistingPlayer('ABCDE', 'guest-1', {
      name: 'Guest',
      gender: 'f',
      avatarColorIndex: 1,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({
        'players/guest-1/online': true,
        'players/guest-1/hasLeft': false,
        'players/guest-1/name': 'Guest',
        liveRoundPlayerUids: ['org-1', 'guest-1'],
      }),
    );
  });

  it('does not resurrect a hasLeft player unless reviveAfterLeave is set', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        status: 'waiting',
        baseWordRound: 1,
        players: {
          'guest-1': { name: 'Guest', wordCount: 0, score: 0, online: false, hasLeft: true },
        },
      }),
    });

    await rejoinExistingPlayer('ABCDE', 'guest-1', {
      name: 'Guest',
      gender: 'f',
      avatarColorIndex: 1,
    });

    expect(updateMock).not.toHaveBeenCalled();

    await rejoinExistingPlayer(
      'ABCDE',
      'guest-1',
      { name: 'Guest', gender: 'f', avatarColorIndex: 1 },
      { reviveAfterLeave: true },
    );

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({
        'players/guest-1/online': true,
        'players/guest-1/hasLeft': false,
      }),
    );
  });

  it('skips rejoin while voluntary leave is in flight', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        status: 'waiting',
        players: {
          'guest-1': { name: 'Guest', wordCount: 0, score: 0, online: true, hasLeft: false },
        },
      }),
    });
    beginVoluntaryLeave('ABCDE', 'guest-1');
    try {
      await rejoinExistingPlayer('ABCDE', 'guest-1', {
        name: 'Guest',
        gender: 'f',
        avatarColorIndex: 1,
      });
      expect(updateMock).not.toHaveBeenCalled();
    } finally {
      endVoluntaryLeave('ABCDE', 'guest-1');
    }
  });

  it('updates lobby setup for organizer', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await updateGameSessionSetup('ABCDE', 'org-1', {
      baseWord: 'портрет',
      settings: DEFAULT_SESSION_SETTINGS,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({
        baseWord: 'портрет',
        baseWordChosenBy: 'org-1',
      }),
    );
  });

  it('rejects setup updates from non-organizer non-picker', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
        },
        baseWordPickerOrder: ['org-1', 'guest'],
        baseWordPickerUid: 'org-1',
      }),
    });

    await expect(
      updateGameSessionSetup('ABCDE', 'guest', {
        settings: DEFAULT_SESSION_SETTINGS,
      }),
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  it('rejects base word when peer takes the seat during validation (ZF6U4)', async () => {
    const alone = {
      ...waitingSession,
      status: 'waiting' as const,
      baseWordRound: 1,
      baseWord: '',
      baseWordPickerOrder: ['org-1', 'guest'],
      baseWordPickerUid: 'org-1',
      resultsExitedBy: { 'org-1': true },
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: false },
      },
    };
    const bothOnline = {
      ...alone,
      baseWordPickerUid: 'guest',
      resultsExitedBy: { 'org-1': true, guest: true },
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      },
    };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => alone })
      .mockResolvedValueOnce({ exists: () => true, val: () => bothOnline });

    await expect(
      updateGameSessionSetup('ABCDE', 'org-1', {
        baseWord: 'портрет',
        settings: DEFAULT_SESSION_SETTINGS,
      }),
    ).rejects.toThrow('NOT_BASE_WORD_PICKER');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects base word from organizer who is not current picker', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        status: 'waiting',
        baseWordRound: 1,
        baseWord: '',
        baseWordPickerOrder: ['org-1', 'guest'],
        baseWordPickerUid: 'guest',
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
        },
      }),
    });

    await expect(
      updateGameSessionSetup('ABCDE', 'org-1', {
        baseWord: 'портрет',
        settings: DEFAULT_SESSION_SETTINGS,
      }),
    ).rejects.toThrow('NOT_BASE_WORD_PICKER');
  });

  it('updates base word for current picker', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        baseWord: '',
      }),
    });

    await updateGameSessionBaseWord('ABCDE', 'org-1', 'портрет');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      { baseWord: 'портрет', baseWordChosenBy: 'org-1' },
    );
  });

  it('rejects base word updates from non-picker', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        baseWordPickerOrder: ['org-1', 'guest'],
        baseWordPickerUid: 'org-1',
      }),
    });

    await expect(updateGameSessionBaseWord('ABCDE', 'guest', 'портрет')).rejects.toThrow(
      'NOT_BASE_WORD_PICKER',
    );
  });

  it('restarts finished session for organizer rematch', async () => {
    const session = finishedSession();
    const waiting = {
      ...session,
      status: 'waiting' as const,
      baseWordRound: 1,
      baseWord: '',
      baseWordChosenBy: null,
    };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => session })
      .mockResolvedValueOnce({ exists: () => true, val: () => session })
      .mockResolvedValue({ exists: () => true, val: () => waiting });
    runTransactionMock.mockResolvedValue({
      committed: true,
      snapshot: { val: () => 'waiting' },
    });
    updateMock.mockResolvedValue(undefined);

    await restartGameSessionForRematch('ABCDE', 'org');

    expect(runTransactionMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({ baseWordRound: 1, 'players/org/online': true }),
    );
    expect(updateMock.mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('rejects rematch restart for non-organizer', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => finishedSession(),
    });

    await expect(restartGameSessionForRematch('ABCDE', 'p2')).rejects.toThrow('REMATCH_FAILED');
  });

  it('syncs player scores from word maps during playing', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: 'тест',
        status: 'playing',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: 5_000_000,
        organizerId: 'org-1',
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0 },
        },
      }),
    });
    updateMock.mockResolvedValue(undefined);

    await syncSessionPlayerScores('ABCDE');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({
        'players/org-1/score': expect.any(Number),
        'players/org-1/wordCount': expect.any(Number),
      }),
    );
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it('skips score sync when word maps are empty', async () => {
    fetchSessionWordMaps.mockResolvedValue({ wordPlayers: {} });

    await syncSessionPlayerScores('ABCDE');

    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('realigns lobby picker seat when chooser is offline but keeps the word', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        baseWord: 'портрет',
        baseWordChosenBy: 'guest',
        baseWordPickerOrder: ['org-1', 'guest'],
        baseWordPickerUid: 'guest',
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: false },
        },
      }),
    });

    await syncLobbyPickerState('ABCDE');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      {
        baseWordPickerUid: 'org-1',
      },
    );
  });

  it('clears orphan shell before recreate', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ players: { 'org-1': { online: false } } }),
    });
    removeMock.mockResolvedValue(undefined);

    await clearSessionRootForRecreate('ABCDE', 'org-1');

    expect(onDisconnectCancel).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalled();
  });

  it('removes orphan shell only when actor is present', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ players: { 'org-1': { online: false } } }),
    });

    await expect(removeOrphanGameSessionShell('ABCDE', 'guest')).resolves.toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('subscribes to session updates after app check', async () => {
    onValueMock.mockImplementation(() => {
      return vi.fn();
    });

    const onSession = vi.fn();
    subscribeGameSession('ABCDE', onSession);

    await vi.waitFor(() => {
      expect(onValueMock).toHaveBeenCalled();
    });

    const onNext = onValueMock.mock.calls[0]?.[1] as (snapshot: {
      exists: () => boolean;
      val: () => unknown;
    }) => void;
    onNext({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        wordPlayers: { порт: { 'org-1': true } },
      }),
    });

    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ABCDE',
        status: 'waiting',
      }),
    );
    expect(onSession.mock.calls[0][0]).not.toHaveProperty('wordPlayers');
  });

  it('shares one RTDB onValue across multiple subscribeGameSession callers', async () => {
    onValueMock.mockImplementation(() => vi.fn());

    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeGameSession('ABCDE', a);
    const unsubB = subscribeGameSession('ABCDE', b);

    await vi.waitFor(() => {
      expect(onValueMock).toHaveBeenCalledTimes(1);
    });

    const onNext = onValueMock.mock.calls[0]?.[1] as (snapshot: {
      exists: () => boolean;
      val: () => unknown;
    }) => void;
    onNext({
      exists: () => true,
      val: () => waitingSession,
    });

    expect(a).toHaveBeenCalledWith(expect.objectContaining({ id: 'ABCDE' }));
    expect(b).toHaveBeenCalledWith(expect.objectContaining({ id: 'ABCDE' }));

    unsubA();
    expect(onValueMock).toHaveBeenCalledTimes(1);
    unsubB();
  });

  it('does not clear the session listener on transient RTDB subscribe errors', async () => {
    onValueMock.mockImplementation(() => vi.fn());

    const onSession = vi.fn();
    subscribeGameSession('ABCDE', onSession);

    await vi.waitFor(() => {
      expect(onValueMock).toHaveBeenCalled();
    });

    const onNext = onValueMock.mock.calls[0]?.[1] as (snapshot: {
      exists: () => boolean;
      val: () => unknown;
    }) => void;
    const onError = onValueMock.mock.calls[0]?.[2] as ((error: Error) => void) | undefined;

    onNext({
      exists: () => true,
      val: () => waitingSession,
    });
    expect(onSession).toHaveBeenCalledTimes(1);

    onError?.(Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' }));
    expect(onSession).toHaveBeenCalledTimes(1);

    onNext({
      exists: () => false,
      val: () => null,
    });
    expect(onSession).toHaveBeenCalledTimes(2);
    expect(onSession).toHaveBeenLastCalledWith(null);
  });

  it('subscribes to presence reconnect after app check', async () => {
    onValueMock.mockImplementation(() => vi.fn());

    const unsub = subscribePlayerOnlinePresence('ABCDE', 'org-1');

    expect(onValueMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(ensureFirebaseAppCheck).toHaveBeenCalled();
      expect(onValueMock).toHaveBeenCalled();
    });
    expect(onValueMock.mock.calls[0]?.[0]).toEqual({ path: '.info/connected' });
    unsub();
  });

  it('does not subscribe to presence when app check fails', async () => {
    ensureFirebaseAppCheck.mockRejectedValue(new Error('APP_CHECK_TOKEN_EMPTY'));
    onValueMock.mockImplementation(() => vi.fn());

    const unsub = subscribePlayerOnlinePresence('ABCDE', 'org-1');

    await vi.waitFor(
      () => {
        expect(ensureFirebaseAppCheck.mock.calls.length).toBeGreaterThanOrEqual(3);
      },
      { timeout: 5000 },
    );
    expect(onValueMock).not.toHaveBeenCalled();
    unsub();
  });

  it('does not subscribe to session when app check fails', async () => {
    ensureFirebaseAppCheck.mockRejectedValue(new Error('APP_CHECK_TOKEN_EMPTY'));
    onValueMock.mockImplementation(() => vi.fn());

    const onSession = vi.fn();
    const unsub = subscribeGameSession('ABCDE', onSession);

    await vi.waitFor(
      () => {
        expect(ensureFirebaseAppCheck.mock.calls.length).toBeGreaterThanOrEqual(3);
      },
      { timeout: 5000 },
    );
    expect(onValueMock).not.toHaveBeenCalled();
    expect(onSession).not.toHaveBeenCalled();
    unsub();
  });
});
