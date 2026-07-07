import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  firebaseDatabaseMockFactory,
  firebaseInitMockFactory,
  getFirebaseRtdbMocks,
  resetFirebaseRtdbMocks,
  rtdbSnapshot,
} from './helpers/mock-firebase-rtdb.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

const runRtdbTransaction = vi.fn();
const getFirebaseUid = vi.fn();
const isRegisteredFirebaseUser = vi.fn();

vi.mock('firebase/database', () => firebaseDatabaseMockFactory());
vi.mock('../lib/firebase/init.js', () => firebaseInitMockFactory());
vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `sessions/${gameId}` }),
}));
vi.mock('../lib/firebase/rtdb-transaction.js', () => ({
  runRtdbTransaction: (...args: unknown[]) => runRtdbTransaction(...args),
}));
vi.mock('../lib/firebase/auth.js', () => ({
  getFirebaseUid: () => getFirebaseUid(),
  isRegisteredFirebaseUser: () => isRegisteredFirebaseUser(),
}));

import { incrementCloudPlayerStatsIfRegistered } from '../lib/firebase/user-stats-service.js';
import { markResultsExited } from '../lib/firebase/results-coordination-service.js';

describe('user-stats-service', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    vi.clearAllMocks();
    isRegisteredFirebaseUser.mockReturnValue(true);
    getFirebaseUid.mockReturnValue('user-1');
    runRtdbTransaction.mockImplementation(async (_ref, updater) => {
      await updater(null);
    });
  });

  it('skips anonymous users', async () => {
    isRegisteredFirebaseUser.mockReturnValue(false);

    await incrementCloudPlayerStatsIfRegistered(true);

    expect(runRtdbTransaction).not.toHaveBeenCalled();
  });

  it('skips when uid is missing', async () => {
    getFirebaseUid.mockReturnValue(null);

    await incrementCloudPlayerStatsIfRegistered(true);

    expect(runRtdbTransaction).not.toHaveBeenCalled();
  });

  it('increments games played and won for registered users', async () => {
    runRtdbTransaction.mockImplementation(async (_ref, updater) => {
      const next = updater({
        gamesPlayed: 2,
        gamesWon: 1,
        wordsCollected: 5,
      });
      expect(next).toEqual({
        gamesPlayed: 3,
        gamesWon: 2,
        wordsCollected: 5,
      });
    });

    await incrementCloudPlayerStatsIfRegistered(true);

    expect(runRtdbTransaction).toHaveBeenCalled();
  });

  it('sanitizes invalid stored stats before incrementing', async () => {
    runRtdbTransaction.mockImplementation(async (_ref, updater) => {
      const next = updater({
        gamesPlayed: -3,
        gamesWon: Number.NaN,
        wordsCollected: -1,
      });
      expect(next).toEqual({
        gamesPlayed: 1,
        gamesWon: 0,
        wordsCollected: 0,
      });
    });

    await incrementCloudPlayerStatsIfRegistered(false);
  });
});

describe('results-coordination-service', () => {
  const { get, set } = getFirebaseRtdbMocks();

  beforeEach(() => {
    resetFirebaseRtdbMocks();
    vi.clearAllMocks();
    set.mockResolvedValue(undefined);
  });

  it('writes resultsExitedBy for finished sessions', async () => {
    get.mockResolvedValue(
      rtdbSnapshot(
        finishedSession({
          org: false,
        }),
      ),
    );

    await markResultsExited('abcd', 'org');

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'game_sessions/ABCD/resultsExitedBy/org' }),
      true,
    );
  });

  it('no-ops when session is missing or player is absent', async () => {
    get.mockResolvedValue(rtdbSnapshot(null, false));
    await markResultsExited('ABCD', 'org');
    expect(set).not.toHaveBeenCalled();

    get.mockResolvedValue(
      rtdbSnapshot({
        ...finishedSession(),
        players: {},
      }),
    );
    await markResultsExited('ABCD', 'org');
    expect(set).not.toHaveBeenCalled();
  });

  it('no-ops when player already marked exited', async () => {
    get.mockResolvedValue(
      rtdbSnapshot(
        finishedSession({
          org: true,
        }),
      ),
    );

    await markResultsExited('ABCD', 'org');

    expect(set).not.toHaveBeenCalled();
  });

  it('swallows permission-denied errors', async () => {
    get.mockResolvedValue(rtdbSnapshot(finishedSession()));
    set.mockRejectedValue({ code: 'PERMISSION_DENIED' });

    await expect(markResultsExited('ABCD', 'org')).resolves.toBeUndefined();
  });

  it('rethrows non-permission errors', async () => {
    get.mockResolvedValue(rtdbSnapshot(finishedSession()));
    set.mockRejectedValue(new Error('NETWORK_ERROR'));

    await expect(markResultsExited('ABCD', 'org')).rejects.toThrow('NETWORK_ERROR');
  });
});
