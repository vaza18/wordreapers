import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const rematchFinishedSessionToWaiting = vi.fn();
const bootstrapRematchWaitingFromArchive = vi.fn();
const finishGameSessionIfExpired = vi.fn();

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
  finishGameSessionIfExpired: (...args: unknown[]) => finishGameSessionIfExpired(...args),
}));

vi.mock('../lib/online/rematch/bootstrap-rematch-waiting-from-archive.js', () => ({
  bootstrapRematchWaitingFromArchive: (...args: unknown[]) =>
    bootstrapRematchWaitingFromArchive(...args),
}));

import { restartRematchOnlineRound } from '../lib/online/rematch/restart-rematch-online-round.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

describe('restartRematchOnlineRound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bootstrapRematchWaitingFromArchive.mockResolvedValue({
      status: 'waiting',
    });
    rematchFinishedSessionToWaiting.mockResolvedValue(undefined);
    finishGameSessionIfExpired.mockResolvedValue(false);
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
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('heals stuck expired playing then rematches (LRAHP)', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
    };
    const finished = { ...expiredPlaying, status: 'finished' as const, timerEndsAt: null };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => expiredPlaying })
      .mockResolvedValue({ exists: () => true, val: () => finished });
    finishGameSessionIfExpired.mockResolvedValue(true);

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(finishGameSessionIfExpired).toHaveBeenCalledWith('ABCDE');
    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('fails rematch when expired playing cannot be finished (LRAHP)', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => expiredPlaying });
    finishGameSessionIfExpired.mockResolvedValue(false);

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

    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('fails rematch when expired playing room vanishes after finish attempt', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
    };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => expiredPlaying })
      .mockResolvedValue({ exists: () => false });
    finishGameSessionIfExpired.mockResolvedValue(true);

    await expect(restartRematchOnlineRound('ABCDE', 'org', 0)).rejects.toThrow('REMATCH_FAILED');
  });

  it('rematches when expired playing heal lands on waiting', async () => {
    const expiredPlaying = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: 1_000_000,
    };
    const waiting = { ...expiredPlaying, status: 'waiting' as const, timerEndsAt: null };
    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => expiredPlaying })
      .mockResolvedValue({ exists: () => true, val: () => waiting });
    finishGameSessionIfExpired.mockResolvedValue(false);

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
});
