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
  child: (parent: { path: string }, sub: string) => ({ path: `${parent.path}/${sub}` }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/public-lobby-service.js', () => ({
  unpublishPublicLobby: vi.fn(),
}));

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  clearSessionWordMaps: vi.fn().mockResolvedValue(undefined),
  ensureSessionWordMapsEmptyForRoundStart: vi.fn().mockResolvedValue(undefined),
  requireSessionWordMaps: vi.fn().mockResolvedValue({ wordPlayers: {} }),
  tryFetchSessionWordMaps: vi.fn().mockResolvedValue({ ok: true, maps: { wordPlayers: {} } }),
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
}));

vi.mock('../services/dictionary-service.js', () => ({
  loadBundledBaseWords: vi.fn().mockResolvedValue(['портрет', 'тест']),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org-1' }),
  getFirebaseUid: vi.fn().mockReturnValue('org-1'),
}));

const devLogAction = vi.fn();
vi.mock('../lib/debug/dev-log.js', () => ({
  devLogAction: (...args: unknown[]) => devLogAction(...args),
}));

vi.mock('../lib/firebase/results-coordination-service.js', () => ({
  markResultsExited: vi.fn().mockResolvedValue(undefined),
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

import {
  abandonWaitingGameSession,
  beginVoluntaryLeave,
  endVoluntaryLeave,
  finishGameSessionIfExpired,
  finishGameSession,
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

  it('rethrows permission-denied instead of treating the room as missing', async () => {
    const denied = Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
    getMock.mockRejectedValue(denied);

    await expect(tryReadGameSessionSnapshot('ABCDE')).rejects.toBe(denied);
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
    updateMock.mockImplementation(async (_ref, patch: Record<string, unknown>) => {
      Object.assign(session, {
        status: patch.status,
        timerEndsAt: patch.timerEndsAt,
      });
    });

    await expect(finishGameSessionIfExpired('ABCDE')).resolves.toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({ status: 'finished', timerEndsAt: null }),
    );
    expect(runTransactionMock).not.toHaveBeenCalled();
    expect(devLogAction).toHaveBeenCalledWith('finished round (timer expired)', {
      room: 'ABCDE',
    });
  });

  it('finishes from hintSession without a full-session get', async () => {
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
    getMock.mockClear();
    updateMock.mockResolvedValue(undefined);

    await expect(finishGameSessionIfExpired('ABCDE', { hintSession: session })).resolves.toBe(true);
    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({ status: 'finished', timerEndsAt: null }),
    );
  });

  it('falls through to get when hintSession has an active addTimeVote', async () => {
    const session = {
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 1_000_000,
      organizerId: 'org-1',
      addTimeVote: {
        proposedBy: 'org-1',
        addMinutes: 1,
        votes: { 'org-1': 'yes' as const },
      },
      players: {
        'org-1': { name: 'Org', wordCount: 1, score: 1, online: true },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => session });
    updateMock.mockClear();

    await expect(finishGameSessionIfExpired('ABCDE', { hintSession: session })).resolves.toBe(
      false,
    );
    expect(getMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns true without get when hintSession is already finished', async () => {
    getMock.mockClear();
    await expect(
      finishGameSessionIfExpired('ABCDE', {
        hintSession: {
          baseWord: 'тест',
          status: 'finished',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: null,
          organizerId: 'org-1',
          players: {},
        },
      }),
    ).resolves.toBe(true);
    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns false without get while hintSession is still inside submit grace', async () => {
    getMock.mockClear();
    updateMock.mockClear();
    await expect(
      finishGameSessionIfExpired('ABCDE', {
        hintSession: {
          baseWord: 'тест',
          status: 'playing',
          settings: DEFAULT_SESSION_SETTINGS,
          // getServerNow mock is 2_000_000; still inside 5s grace after 1_999_000.
          timerEndsAt: 1_999_000,
          organizerId: 'org-1',
          players: {
            'org-1': { name: 'Org', wordCount: 1, score: 1, online: true },
          },
        },
      }),
    ).resolves.toBe(false);
    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('force-finishes a playing session and logs finished round', async () => {
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

    await finishGameSession('ABCDE');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({ status: 'finished', timerEndsAt: null }),
    );
    expect(devLogAction).toHaveBeenCalledWith('finished round', { room: 'ABCDE' });
  });

  it('transitions a finished session back to waiting for rematch', async () => {
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
      .mockResolvedValue({ exists: () => true, val: () => waiting });
    runTransactionMock.mockImplementation(
      async (ref: { path: string }, updater: (c: unknown) => unknown) => {
        expect(ref.path).toBe('game_sessions/ABCDE/status');
        const next = updater('finished');
        return { committed: next === 'waiting', snapshot: { val: () => next } };
      },
    );
    updateMock.mockResolvedValue(undefined);

    await rematchFinishedSessionToWaiting('ABCDE', 'org');

    expect(runTransactionMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({
        baseWordRound: 1,
        baseWord: '',
        'players/org/online': true,
        'players/org/score': 0,
      }),
    );
    const followUp = updateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(followUp).not.toHaveProperty('status');
    expect(followUp).not.toHaveProperty('players/p2/online');
  });

  it('rejects rematch reopen when finished on the final room round', async () => {
    const { MAX_ROUNDS_PER_ROOM } = await import('../constants/max-rounds-per-room.js');
    const session = { ...finishedSession(), baseWordRound: MAX_ROUNDS_PER_ROOM - 1 };
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await expect(rematchFinishedSessionToWaiting('ABCDE', 'org')).rejects.toThrow('REMATCH_FAILED');
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it('joins an already-open rematch waiting lobby without rewriting players (AH2TN)', async () => {
    const { markResultsExited } = await import('../lib/firebase/results-coordination-service.js');
    const openWaiting = {
      ...finishedSession({ org: true }),
      status: 'waiting' as const,
      baseWordRound: 2,
      baseWord: '',
      baseWordChosenBy: null,
      baseWordPickerUid: 'org',
      resultsExitedBy: { org: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => openWaiting });

    await rematchFinishedSessionToWaiting('ABCDE', 'p2');

    expect(runTransactionMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ baseWordRound: expect.any(Number) }),
    );
    expect(markResultsExited).toHaveBeenCalledWith('ABCDE', 'p2');
  });

  it('joins when status CAS loses to an already-open waiting lobby (AH2TN)', async () => {
    const { markResultsExited } = await import('../lib/firebase/results-coordination-service.js');
    const staleFinished = finishedSession();
    const openWaiting = {
      ...staleFinished,
      status: 'waiting' as const,
      baseWordRound: 2,
      baseWordPickerUid: 'org',
      resultsExitedBy: { org: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 5, score: 5, online: false },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
    };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => staleFinished })
      .mockResolvedValue({ exists: () => true, val: () => openWaiting });
    runTransactionMock.mockImplementation(async (_ref, updater: (c: unknown) => unknown) => {
      const next = updater('waiting');
      return { committed: next != null, snapshot: { val: () => 'waiting' } };
    });

    await rematchFinishedSessionToWaiting('ABCDE', 'p2');

    expect(runTransactionMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ baseWordRound: 2 }),
    );
    expect(markResultsExited).toHaveBeenCalledWith('ABCDE', 'p2');
  });

  it('opens rematch via status CAS so results presence cannot maxretry the claim (T2ZJU)', async () => {
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
      .mockResolvedValue({ exists: () => true, val: () => waiting });
    runTransactionMock.mockResolvedValue({
      committed: true,
      snapshot: { val: () => 'waiting' },
    });
    updateMock.mockResolvedValue(undefined);

    await rematchFinishedSessionToWaiting('ABCDE', 'org');

    expect(runTransactionMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCDE' }),
      expect.objectContaining({ baseWordRound: 1, 'players/org/online': true }),
    );
  });

  it('keeps opened rematch after follow-up PD instead of false-joining (R62F9)', async () => {
    const { markResultsExited } = await import('../lib/firebase/results-coordination-service.js');
    const session = finishedSession();
    const waitingIncomplete = {
      ...session,
      status: 'waiting' as const,
      // Follow-up failed — round not bumped yet, but status CAS already claimed.
      baseWordRound: 0,
      baseWord: 'старе',
    };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => session })
      .mockResolvedValue({ exists: () => true, val: () => waitingIncomplete });
    runTransactionMock.mockResolvedValue({
      committed: true,
      snapshot: { val: () => 'waiting' },
    });
    updateMock.mockRejectedValue(new Error('PERMISSION_DENIED'));

    await rematchFinishedSessionToWaiting('ABCDE', 'org');

    expect(runTransactionMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
    // Must not take join path (that logged "peer already opened" while nobody opened).
    expect(markResultsExited).toHaveBeenCalledWith('ABCDE', 'org');
    expect(
      updateMock.mock.calls.some(([, patch]) => patch && 'baseWordRound' in (patch as object)),
    ).toBe(true);
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

  it('does not finish until word-submit grace after timerEndsAt', async () => {
    // getServerNow mock is 2_000_000; timer just elapsed but within FINISH_WORD_SUBMIT_GRACE_MS.
    const session = {
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 1_998_000,
      organizerId: 'org-1',
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await expect(finishGameSessionIfExpired('ABCDE')).resolves.toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
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
