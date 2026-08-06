import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const rematchFinishedSessionToWaiting = vi.fn();
const bootstrapRematchWaitingFromArchive = vi.fn();
const ensureSessionFinishedForResults = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => 2_000_000,
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  rematchFinishedSessionToWaiting: (...args: unknown[]) => rematchFinishedSessionToWaiting(...args),
}));

vi.mock('../lib/online/rematch/bootstrap-rematch-waiting-from-archive.js', () => ({
  bootstrapRematchWaitingFromArchive: (...args: unknown[]) =>
    bootstrapRematchWaitingFromArchive(...args),
}));

vi.mock('../lib/online/ensure-session-finished-for-results.js', () => ({
  ensureSessionFinishedForResults: (...args: unknown[]) => ensureSessionFinishedForResults(...args),
}));

import { restartRematchOnlineRound } from '../lib/online/rematch/restart-rematch-online-round.js';
import { MAX_ROUNDS_PER_ROOM } from '../constants/max-rounds-per-room.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

describe('restartRematchOnlineRound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bootstrapRematchWaitingFromArchive.mockResolvedValue({
      status: 'waiting',
    });
    rematchFinishedSessionToWaiting.mockResolvedValue(undefined);
    ensureSessionFinishedForResults.mockResolvedValue('finished');
  });

  it('bootstraps waiting from archive when RTDB session is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).toHaveBeenCalledWith('ABCDE', 'org', 0);
  });

  it('joins an already-open rematch waiting lobby', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ ...finishedSession(), status: 'waiting' }),
    });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('reopens a finished session into waiting', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => finishedSession(),
    });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('no-ops when rematch is requested during an active (unexpired) round', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...finishedSession(),
        status: 'playing',
        timerEndsAt: 3_000_000,
      }),
    });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
    expect(ensureSessionFinishedForResults).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('heals stuck expired playing then rematches (LRAHP)', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
      baseWordRound: 0,
    };
    const finished = { ...expiredPlaying, status: 'finished' as const, timerEndsAt: null };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => expiredPlaying })
      .mockResolvedValue({ exists: () => true, val: () => finished });
    ensureSessionFinishedForResults.mockResolvedValue('finished');

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(ensureSessionFinishedForResults).toHaveBeenCalledWith('ABCDE', {
      expectedBaseWordRound: 0,
    });
    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('waits through finish grace via ensure then rematches (LRAHP)', async () => {
    // UI-expired (now >= timerEndsAt) but still inside FINISH_WORD_SUBMIT_GRACE —
    // ensure polls until finish lands; must not fail on first no-op finish.
    const gracePlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_997_000,
      baseWordRound: 1,
    };
    const finished = { ...gracePlaying, status: 'finished' as const, timerEndsAt: null };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => gracePlaying })
      .mockResolvedValue({ exists: () => true, val: () => finished });
    ensureSessionFinishedForResults.mockResolvedValue('finished');

    await restartRematchOnlineRound('ABCDE', 'org', 1);

    expect(ensureSessionFinishedForResults).toHaveBeenCalledWith('ABCDE', {
      expectedBaseWordRound: 1,
    });
    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('fails rematch when ensure finish times out (LRAHP)', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => expiredPlaying });
    ensureSessionFinishedForResults.mockResolvedValue('timeout');

    await expect(restartRematchOnlineRound('ABCDE', 'org', 0)).rejects.toThrow('REMATCH_FAILED');
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('no-ops when expired playing still has an add-time vote', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...finishedSession(),
        status: 'playing',
        timerEndsAt: 1_000_000,
        addTimeVote: {
          proposedBy: 'org',
          proposedAt: 1_900_000,
          addMinutes: 5,
          votes: { org: 'yes' as const },
        },
      }),
    });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(ensureSessionFinishedForResults).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('fails rematch when expired playing room vanishes after ensure finish', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
    };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => expiredPlaying })
      .mockResolvedValue({ exists: () => false });
    ensureSessionFinishedForResults.mockResolvedValue('finished');

    await expect(restartRematchOnlineRound('ABCDE', 'org', 0)).rejects.toThrow('REMATCH_FAILED');
  });

  it('rematches when ensure lands on waiting (peer rematch / rematch_advanced)', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
    };
    const waiting = { ...expiredPlaying, status: 'waiting' as const, timerEndsAt: null };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => expiredPlaying })
      .mockResolvedValue({ exists: () => true, val: () => waiting });
    ensureSessionFinishedForResults.mockResolvedValue('rematch_advanced');

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('does not bootstrap from archive on permission-denied RTDB reads', async () => {
    const permissionDenied = Object.assign(new Error('PERMISSION_DENIED'), {
      code: 'PERMISSION_DENIED',
    });
    getMock.mockRejectedValue(permissionDenied);

    await expect(restartRematchOnlineRound('ABCDE', 'org', 0)).rejects.toBe(permissionDenied);

    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('rethrows non-permission RTDB read errors', async () => {
    getMock.mockRejectedValue(new Error('NETWORK_ERROR'));

    await expect(restartRematchOnlineRound('ABCDE', 'org', 0)).rejects.toThrow('NETWORK_ERROR');
  });

  it('rejects bootstrap rematch after the final room round', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(
      restartRematchOnlineRound('ABCDE', 'org', MAX_ROUNDS_PER_ROOM - 1),
    ).rejects.toThrow('REMATCH_FAILED');
    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
  });

  it('rejects finished→waiting rematch after the final room round', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ ...finishedSession(), baseWordRound: MAX_ROUNDS_PER_ROOM - 1 }),
    });

    await expect(
      restartRematchOnlineRound('ABCDE', 'org', MAX_ROUNDS_PER_ROOM - 1),
    ).rejects.toThrow('REMATCH_FAILED');
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('still joins an already-open waiting lobby after a final finished round index', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...finishedSession(),
        status: 'waiting',
        baseWordRound: MAX_ROUNDS_PER_ROOM - 1,
      }),
    });

    await restartRematchOnlineRound('ABCDE', 'org', MAX_ROUNDS_PER_ROOM - 2);

    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });
});
