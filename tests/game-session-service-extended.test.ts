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

vi.mock('../lib/firebase/app-check.js', () => ({
  ensureFirebaseAppCheck: () => ensureFirebaseAppCheck(),
}));

import {
  clearSessionRootForRecreate,
  joinGameSession,
  rejoinExistingPlayer,
  removeOrphanGameSessionShell,
  restartGameSessionForRematch,
  subscribeGameSession,
  syncLobbyPickerState,
  syncSessionPlayerScores,
  updateGameSessionBaseWord,
  updateGameSessionSetup,
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
    vi.clearAllMocks();
    onDisconnectCancel.mockResolvedValue(undefined);
    onDisconnectUpdate.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
    setMock.mockResolvedValue(undefined);
    ensureFirebaseAppCheck.mockResolvedValue(undefined);
    fetchSessionWordMaps.mockResolvedValue({
      wordPlayers: { порт: { 'org-1': true } },
      wordFirst: { порт: 'org-1' },
    });
  });

  it('rejects invalid room codes on join', async () => {
    await expect(joinGameSession('!!!', profile)).rejects.toThrow('INVALID_CODE');
  });

  it('throws ROOM_NOT_FOUND when session root is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(joinGameSession('ABCD', profile)).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('rejoins an existing player and appends live round uid while playing', async () => {
    getMock
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ name: 'Guest', wordCount: 0, score: 0, online: false }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          status: 'playing',
          liveRoundPlayerUids: ['org-1'],
        }),
      });

    await rejoinExistingPlayer('ABCD', 'guest-1', {
      name: 'Guest',
      gender: 'f',
      avatarColorIndex: 1,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCD/players/guest-1' }),
      expect.objectContaining({ online: true, hasLeft: false }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCD' }),
      { liveRoundPlayerUids: ['org-1', 'guest-1'] },
    );
  });

  it('updates lobby setup for organizer', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await updateGameSessionSetup('ABCD', 'org-1', {
      baseWord: 'портрет',
      settings: DEFAULT_SESSION_SETTINGS,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCD' }),
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
      updateGameSessionSetup('ABCD', 'guest', {
        settings: DEFAULT_SESSION_SETTINGS,
      }),
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  it('updates base word for current picker', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        baseWord: '',
      }),
    });

    await updateGameSessionBaseWord('ABCD', 'org-1', 'портрет');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCD' }),
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

    await expect(updateGameSessionBaseWord('ABCD', 'guest', 'портрет')).rejects.toThrow(
      'NOT_BASE_WORD_PICKER',
    );
  });

  it('restarts finished session for organizer rematch', async () => {
    const session = finishedSession();
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => session })
      .mockResolvedValueOnce({ exists: () => true, val: () => session })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ ...session, status: 'waiting' }),
      });

    await restartGameSessionForRematch('ABCD', 'org');

    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'waiting' }),
    );
  });

  it('rejects rematch restart for non-organizer', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => finishedSession(),
    });

    await expect(restartGameSessionForRematch('ABCD', 'p2')).rejects.toThrow('REMATCH_FAILED');
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
    runTransactionMock.mockImplementation(async (_ref, updater) => {
      const next = updater({
        'org-1': { name: 'Org', wordCount: 0, score: 0 },
      });
      expect(next).toBeTruthy();
      return { committed: true };
    });

    await syncSessionPlayerScores('ABCD');

    expect(runTransactionMock).toHaveBeenCalled();
  });

  it('skips score sync when word maps are empty', async () => {
    fetchSessionWordMaps.mockResolvedValue({ wordPlayers: {}, wordFirst: {} });

    await syncSessionPlayerScores('ABCD');

    expect(getMock).not.toHaveBeenCalled();
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it('realigns lobby picker when offline players invalidate chosen base word', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...waitingSession,
        baseWord: 'портрет',
        baseWordChosenBy: 'guest',
        baseWordPickerOrder: ['org-1', 'guest'],
        baseWordPickerUid: 'org-1',
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: false },
        },
      }),
    });

    await syncLobbyPickerState('ABCD');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCD' }),
      {
        baseWord: '',
        baseWordChosenBy: null,
      },
    );
  });

  it('clears orphan shell before recreate', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ players: { 'org-1': { online: false } } }),
    });
    removeMock.mockResolvedValue(undefined);

    await clearSessionRootForRecreate('ABCD', 'org-1');

    expect(onDisconnectCancel).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalled();
  });

  it('removes orphan shell only when actor is present', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ players: { 'org-1': { online: false } } }),
    });

    await expect(removeOrphanGameSessionShell('ABCD', 'guest')).resolves.toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('subscribes to session updates after app check', async () => {
    onValueMock.mockImplementation(() => {
      return vi.fn();
    });

    const onSession = vi.fn();
    subscribeGameSession('ABCD', onSession);

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
        wordFirst: { порт: 'org-1' },
        wordPlayers: { порт: { 'org-1': true } },
      }),
    });

    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ABCD',
        status: 'waiting',
      }),
    );
    expect(onSession.mock.calls[0][0]).not.toHaveProperty('wordFirst');
  });
});
