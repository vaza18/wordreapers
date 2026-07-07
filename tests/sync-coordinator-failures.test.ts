import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const abandonWaitingGameSession = vi.fn();
const persistLocalArchive = vi.fn();
const finalizeOnlineRoundForPlayer = vi.fn();
const clearPendingRoundArchive = vi.fn();
const notifyRoundFinishedOnce = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  abandonWaitingGameSession: (...args: unknown[]) => abandonWaitingGameSession(...args),
}));

vi.mock('../lib/firebase/player-words-service.js', () => ({
  fetchSessionPlayerWords: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../lib/online/coordinated-session-cleanup.js', () => ({
  persistLocalArchive: (...args: unknown[]) => persistLocalArchive(...args),
}));

vi.mock('../lib/online/finalize-online-round.js', () => ({
  finalizeOnlineRoundForPlayer: (...args: unknown[]) => finalizeOnlineRoundForPlayer(...args),
}));

vi.mock('../lib/online/pending-round-archive.js', () => ({
  clearPendingRoundArchive: (...args: unknown[]) => clearPendingRoundArchive(...args),
  listPendingRoundArchives: vi.fn(),
}));

vi.mock('../lib/online/online-session-archive.js', () => ({
  getFinishedRoundArchive: vi.fn(),
  isFinishedArchiveStale: vi.fn(),
  listFinishedRoundArchives: vi.fn(),
  markFinishedArchiveAckSent: vi.fn(),
}));

vi.mock('../lib/online/round-finished-notification-once.js', () => ({
  notifyRoundFinishedOnce: (...args: unknown[]) => notifyRoundFinishedOnce(...args),
}));

import {
  getFinishedRoundArchive,
  listFinishedRoundArchives,
} from '../lib/online/online-session-archive.js';
import { listPendingRoundArchives } from '../lib/online/pending-round-archive.js';
import { syncFinishedRoundsCoordinator } from '../lib/online/sync-coordinator.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

describe('syncFinishedRoundsCoordinator failure paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPendingRoundArchives).mockResolvedValue([]);
    vi.mocked(listFinishedRoundArchives).mockResolvedValue([]);
    vi.mocked(getFinishedRoundArchive).mockResolvedValue(null);
    persistLocalArchive.mockResolvedValue(undefined);
    finalizeOnlineRoundForPlayer.mockResolvedValue(undefined);
    clearPendingRoundArchive.mockResolvedValue(undefined);
    abandonWaitingGameSession.mockResolvedValue(undefined);
    notifyRoundFinishedOnce.mockResolvedValue(undefined);
  });

  it('clears pending archive when session is missing but archive exists', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCD', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);
    getMock.mockResolvedValue({ exists: () => false });
    vi.mocked(getFinishedRoundArchive).mockResolvedValue({
      gameId: 'ABCD',
      baseWordRound: 0,
      savedAt: 1_000,
      session: {
        baseWord: 'тест',
        status: 'finished',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        players: { org: { name: 'Org', wordCount: 0, score: 0 } },
      },
      playerWords: {},
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCD', 0);
    expect(notifyRoundFinishedOnce).toHaveBeenCalled();
  });

  it('drops stale pending work when baseWordRound no longer matches', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCD', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: 'тест',
        status: 'finished',
        baseWordRound: 1,
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        players: { org: { name: 'Org', wordCount: 0, score: 0 } },
      }),
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCD', 0);
    expect(persistLocalArchive).not.toHaveBeenCalled();
  });

  it('continues queue when one item throws', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'FAIL', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
      { gameId: 'ABCD', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);
    getMock.mockRejectedValueOnce(new Error('NETWORK')).mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        baseWord: 'тест',
        status: 'finished',
        baseWordRound: 0,
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        players: { org: { name: 'Org', wordCount: 1, score: 1 } },
      }),
    });
    persistLocalArchive.mockResolvedValue(undefined);

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(persistLocalArchive).toHaveBeenCalled();
  });
});
