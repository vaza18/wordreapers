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

vi.mock('../lib/online/bootstrap-rematch-waiting-from-archive.js', () => ({
  bootstrapRematchWaitingFromArchive: (...args: unknown[]) =>
    bootstrapRematchWaitingFromArchive(...args),
}));

import { restartRematchOnlineRound } from '../lib/online/restart-rematch-online-round.js';
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

    await restartRematchOnlineRound('ABCD', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).toHaveBeenCalledWith('ABCD', 'org', 0);
  });

  it('no-ops when rematch lobby is already waiting', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ ...finishedSession(), status: 'waiting' }),
    });

    await restartRematchOnlineRound('ABCD', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });

  it('reopens a finished session into waiting', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => finishedSession(),
    });

    await restartRematchOnlineRound('ABCD', 'org', 0);

    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCD', 'org');
  });

  it('no-ops when rematch is requested during an active round', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ ...finishedSession(), status: 'playing' }),
    });

    await restartRematchOnlineRound('ABCD', 'org', 0);

    expect(bootstrapRematchWaitingFromArchive).not.toHaveBeenCalled();
    expect(rematchFinishedSessionToWaiting).not.toHaveBeenCalled();
  });
});
