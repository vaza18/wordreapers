import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const rematchFinishedSessionToWaiting = vi.fn();
const bootstrapRematchWaitingFromArchive = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  rematchFinishedSessionToWaiting: (...args: unknown[]) => rematchFinishedSessionToWaiting(...args),
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
  });

  it('bootstraps waiting from archive when RTDB session is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).toHaveBeenCalledWith('ABCDE', 'org', 0);
  });

  it('no-ops when rematch lobby is already waiting', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ ...finishedSession(), status: 'waiting' }),
    });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('reopens a finished session into waiting', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => finishedSession(),
    });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('no-ops when rematch is requested during an active round', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ ...finishedSession(), status: 'playing' }),
    });

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('ignores permission-denied RTDB reads and bootstraps from archive', async () => {
    const permissionDenied = Object.assign(new Error('PERMISSION_DENIED'), {
      code: 'PERMISSION_DENIED',
    });
    getMock.mockRejectedValue(permissionDenied);

    await restartRematchOnlineRound('ABCDE', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).toHaveBeenCalledWith('ABCDE', 'org', 0);
  });

  it('rethrows non-permission RTDB read errors', async () => {
    getMock.mockRejectedValue(new Error('NETWORK_ERROR'));

    await expect(restartRematchOnlineRound('ABCDE', 'org', 0)).rejects.toThrow('NETWORK_ERROR');
  });
});
