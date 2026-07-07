import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const abandonWaitingGameSession = vi.fn();
const fetchSessionPlayerWords = vi.fn();
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
  fetchSessionPlayerWords: (...args: unknown[]) => fetchSessionPlayerWords(...args),
}));

vi.mock('../lib/online/coordinated-session-cleanup.js', () => ({
  persistLocalArchive: (...args: unknown[]) => persistLocalArchive(...args),
}));

vi.mock('../lib/online/finalize-online-round.js', () => ({
  finalizeOnlineRoundForPlayer: (...args: unknown[]) => finalizeOnlineRoundForPlayer(...args),
}));

vi.mock('../lib/online/session/pending-round-archive.js', () => ({
  clearPendingRoundArchive: (...args: unknown[]) => clearPendingRoundArchive(...args),
  listPendingRoundArchives: vi.fn(),
}));

vi.mock('../lib/online/session/online-session-archive.js', () => ({
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
  isFinishedArchiveStale,
  listFinishedRoundArchives,
  markFinishedArchiveAckSent,
} from '../lib/online/session/online-session-archive.js';
import { listPendingRoundArchives } from '../lib/online/session/pending-round-archive.js';
import {
  buildSyncWorkQueue,
  syncFinishedRoundsCoordinator,
} from '../lib/online/sync-coordinator.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

describe('sync-coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPendingRoundArchives).mockResolvedValue([]);
    vi.mocked(listFinishedRoundArchives).mockResolvedValue([]);
    vi.mocked(getFinishedRoundArchive).mockResolvedValue(null);
    vi.mocked(isFinishedArchiveStale).mockReturnValue(true);
    vi.mocked(markFinishedArchiveAckSent).mockResolvedValue(undefined);
    fetchSessionPlayerWords.mockResolvedValue(new Map());
    persistLocalArchive.mockResolvedValue(undefined);
    finalizeOnlineRoundForPlayer.mockResolvedValue(undefined);
    clearPendingRoundArchive.mockResolvedValue(undefined);
    abandonWaitingGameSession.mockResolvedValue(undefined);
  });

  it('dedupes pending and recent archives in buildSyncWorkQueue', () => {
    const queue = buildSyncWorkQueue(
      [{ gameId: 'ABCD', baseWordRound: 0, uid: 'u1', markedAt: 1_000 }],
      [
        {
          gameId: 'ABCD',
          baseWordRound: 0,
          savedAt: 1_000,
          ackSent: false,
          session: {
            baseWord: 'тест',
            status: 'finished',
            settings: DEFAULT_SESSION_SETTINGS,
            timerEndsAt: null,
            organizerId: 'org',
            players: {},
          },
          playerWords: {},
        },
      ],
      'u2',
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      gameId: 'ABCD',
      baseWordRound: 0,
      fromPending: true,
      uid: 'u1',
    });
  });

  it('persists finished round archives for rostered players', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCD', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: 'тест',
        status: 'finished',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        baseWordRound: 0,
        players: {
          org: { name: 'Org', wordCount: 1, score: 5, online: false },
        },
      }),
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(persistLocalArchive).toHaveBeenCalled();
    expect(finalizeOnlineRoundForPlayer).toHaveBeenCalled();
    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCD', 0);
  });

  it('abandons stale waiting rooms when organizer is alone offline', async () => {
    vi.mocked(listFinishedRoundArchives).mockResolvedValue([
      {
        gameId: 'WAIT1',
        baseWordRound: 0,
        savedAt: 1_000,
        ackSent: false,
        session: {
          baseWord: 'тест',
          status: 'waiting',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: null,
          organizerId: 'org',
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
          },
        },
        playerWords: {},
      },
    ]);
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: 'тест',
        status: 'waiting',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: false },
        },
      }),
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(abandonWaitingGameSession).toHaveBeenCalledWith('WAIT1', 'org');
  });

  it('skips sync work for the active play screen game', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCD', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);

    await syncFinishedRoundsCoordinator({ uid: 'org', activePlayGameId: 'ABCD' });

    expect(getMock).not.toHaveBeenCalled();
    expect(persistLocalArchive).not.toHaveBeenCalled();
  });
});
