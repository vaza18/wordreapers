import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const abandonWaitingGameSession = vi.fn();
const tryFetchSessionWordMaps = vi.fn();
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

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  tryFetchSessionWordMaps: (...args: unknown[]) => tryFetchSessionWordMaps(...args),
}));

vi.mock('../lib/debug/dev-log.js', () => ({
  devLogAction: vi.fn(),
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
  isLegacyFinishedArchiveWords: vi.fn(() => false),
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
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    persistLocalArchive.mockResolvedValue('saved');
    finalizeOnlineRoundForPlayer.mockResolvedValue(undefined);
    clearPendingRoundArchive.mockResolvedValue(undefined);
    abandonWaitingGameSession.mockResolvedValue(undefined);
  });

  it('dedupes pending and recent archives in buildSyncWorkQueue', () => {
    const queue = buildSyncWorkQueue(
      [{ gameId: 'ABCDE', baseWordRound: 0, uid: 'u1', markedAt: 1_000 }],
      [
        {
          gameId: 'ABCDE',
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
      gameId: 'ABCDE',
      baseWordRound: 0,
      fromPending: true,
      uid: 'u1',
    });
  });

  it('persists finished round archives for rostered players', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCDE', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
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
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { порт: { org: true } } },
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(persistLocalArchive).toHaveBeenCalledWith(
      'ABCDE',
      'org',
      expect.objectContaining({ status: 'finished' }),
      expect.any(Map),
    );
    const archivedWords = persistLocalArchive.mock.calls[0]?.[3] as Map<string, string[]>;
    expect(archivedWords.get('org')).toEqual(['порт']);
    expect(finalizeOnlineRoundForPlayer).toHaveBeenCalled();
    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCDE', 0);
  });

  it('keeps pending when maps fetch fails', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCDE', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
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
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(persistLocalArchive).not.toHaveBeenCalled();
    expect(finalizeOnlineRoundForPlayer).not.toHaveBeenCalled();
    expect(clearPendingRoundArchive).not.toHaveBeenCalled();
  });

  it('keeps pending when empty maps disagree with wordPlayers claim', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCDE', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
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
        wordPlayers: { порт: { org: true } },
        players: {
          org: { name: 'Org', wordCount: 1, score: 5, online: false },
        },
      }),
    });
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(persistLocalArchive).not.toHaveBeenCalled();
    expect(finalizeOnlineRoundForPlayer).not.toHaveBeenCalled();
    expect(clearPendingRoundArchive).not.toHaveBeenCalled();
  });

  it('does not clear pending when legacy empty+counts and maps are empty', async () => {
    const { isLegacyFinishedArchiveWords } =
      await import('../lib/online/session/online-session-archive.js');
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCDE', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);
    vi.mocked(isLegacyFinishedArchiveWords).mockReturnValue(true);
    vi.mocked(getFinishedRoundArchive).mockResolvedValue({
      gameId: 'ABCDE',
      baseWordRound: 0,
      savedAt: 1,
      ackSent: false,
      session: {
        baseWord: 'тест',
        status: 'finished',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        baseWordRound: 0,
        players: {
          org: { name: 'Org', wordCount: 2, score: 4, online: false },
        },
      },
      playerWords: { org: null } as unknown as Record<string, string[]>,
      playerWordCounts: { org: 2 },
    });
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: 'тест',
        status: 'finished',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        baseWordRound: 0,
        wordPlayers: { порт: { org: true } },
        players: {
          org: { name: 'Org', wordCount: 2, score: 4, online: false },
        },
      }),
    });
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(finalizeOnlineRoundForPlayer).not.toHaveBeenCalled();
    expect(markFinishedArchiveAckSent).not.toHaveBeenCalled();
    expect(clearPendingRoundArchive).not.toHaveBeenCalled();
  });

  it('finalizes from live maps when legacy archive extract is empty but maps still have words', async () => {
    const { isLegacyFinishedArchiveWords } =
      await import('../lib/online/session/online-session-archive.js');
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCDE', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);
    vi.mocked(isLegacyFinishedArchiveWords).mockReturnValue(true);
    vi.mocked(getFinishedRoundArchive).mockResolvedValue({
      gameId: 'ABCDE',
      baseWordRound: 0,
      savedAt: 1,
      ackSent: false,
      session: {
        baseWord: 'тест',
        status: 'finished',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        baseWordRound: 0,
        players: {
          org: { name: 'Org', wordCount: 1, score: 2, online: false },
        },
      },
      playerWords: { org: null } as unknown as Record<string, string[]>,
      playerWordCounts: { org: 1 },
    });
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
          org: { name: 'Org', wordCount: 1, score: 2, online: false },
        },
      }),
    });
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { порт: { org: true } } },
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(persistLocalArchive).toHaveBeenCalled();
    expect(finalizeOnlineRoundForPlayer).toHaveBeenCalledWith(
      'ABCDE',
      0,
      'org',
      expect.arrayContaining([expect.objectContaining({ playerId: 'org', wordCount: 1 })]),
    );
    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCDE', 0);
  });

  it('finalizes legacy archive stats from normalized object keys', async () => {
    const { isLegacyFinishedArchiveWords } =
      await import('../lib/online/session/online-session-archive.js');
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCDE', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);
    vi.mocked(isLegacyFinishedArchiveWords).mockReturnValue(true);
    vi.mocked(getFinishedRoundArchive).mockResolvedValue({
      gameId: 'ABCDE',
      baseWordRound: 0,
      savedAt: 1,
      ackSent: true,
      session: {
        baseWord: 'тест',
        status: 'finished',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        baseWordRound: 0,
        players: {
          org: { name: 'Org', wordCount: 1, score: 2, online: false },
        },
      },
      playerWords: {
        org: { порт: { display: 'ПОРТ', at: 1 } },
      } as unknown as Record<string, string[]>,
      playerWordCounts: { org: 1 },
    });
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
          org: { name: 'Org', wordCount: 1, score: 2, online: false },
        },
      }),
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(finalizeOnlineRoundForPlayer).toHaveBeenCalledWith(
      'ABCDE',
      0,
      'org',
      expect.arrayContaining([expect.objectContaining({ playerId: 'org', wordCount: 1 })]),
    );
    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCDE', 0);
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

  it('does not abandon rematch waiting when an offline peer still has the opt-in latch', async () => {
    vi.mocked(listFinishedRoundArchives).mockResolvedValue([
      {
        gameId: 'WAIT2',
        baseWordRound: 1,
        savedAt: 1_000,
        ackSent: false,
        session: {
          baseWord: 'тест',
          status: 'waiting',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: null,
          organizerId: 'org',
          baseWordRound: 1,
          resultsExitedBy: { peer: true },
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
            peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
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
        baseWordRound: 1,
        resultsExitedBy: { peer: true },
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: false },
          peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
        },
      }),
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(abandonWaitingGameSession).not.toHaveBeenCalled();
  });

  it('does not abandon rematch waiting when the first rematcher is alone offline with latch', async () => {
    vi.mocked(listFinishedRoundArchives).mockResolvedValue([
      {
        gameId: 'WAIT3',
        baseWordRound: 4,
        savedAt: 1_000,
        ackSent: false,
        session: {
          baseWord: '',
          status: 'waiting',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: null,
          organizerId: 'org',
          baseWordRound: 4,
          resultsExitedBy: { org: true },
          baseWordPickerUid: 'org',
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
            peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
          },
        },
        playerWords: {},
      },
    ]);
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: '',
        status: 'waiting',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        baseWordRound: 4,
        resultsExitedBy: { org: true },
        baseWordPickerUid: 'org',
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: false },
          peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
        },
      }),
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(abandonWaitingGameSession).not.toHaveBeenCalled();
  });

  it('abandons rematch waiting when durable opt-in players all have hasLeft', async () => {
    vi.mocked(listFinishedRoundArchives).mockResolvedValue([
      {
        gameId: 'WAIT4',
        baseWordRound: 3,
        savedAt: 1_000,
        ackSent: false,
        session: {
          baseWord: '',
          status: 'waiting',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: null,
          organizerId: 'org',
          baseWordRound: 3,
          resultsExitedBy: { org: true, peer: true },
          baseWordPickerUid: 'org',
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
            peer: { name: 'Peer', wordCount: 0, score: 0, online: false, hasLeft: true },
          },
        },
        playerWords: {},
      },
    ]);
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        baseWord: '',
        status: 'waiting',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org',
        baseWordRound: 3,
        resultsExitedBy: { org: true, peer: true },
        baseWordPickerUid: 'org',
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
          peer: { name: 'Peer', wordCount: 0, score: 0, online: false, hasLeft: true },
        },
      }),
    });

    await syncFinishedRoundsCoordinator({ uid: 'org' });

    expect(abandonWaitingGameSession).toHaveBeenCalledWith('WAIT4', 'org');
  });

  it('skips sync work for the active play screen game', async () => {
    vi.mocked(listPendingRoundArchives).mockResolvedValue([
      { gameId: 'ABCDE', baseWordRound: 0, uid: 'org', markedAt: 1_000 },
    ]);

    await syncFinishedRoundsCoordinator({ uid: 'org', activeOnlineGameId: 'ABCDE' });

    expect(getMock).not.toHaveBeenCalled();
    expect(persistLocalArchive).not.toHaveBeenCalled();
  });

  it('skips sync work for the active rematch lobby game', async () => {
    vi.mocked(listFinishedRoundArchives).mockResolvedValue([
      {
        gameId: 'LOBBY',
        baseWordRound: 2,
        savedAt: 1_000,
        ackSent: false,
        session: {
          baseWord: 'тест',
          status: 'waiting',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: null,
          organizerId: 'org',
          baseWordRound: 2,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
          },
        },
        playerWords: {},
      },
    ]);

    await syncFinishedRoundsCoordinator({ uid: 'org', activeOnlineGameId: 'LOBBY' });

    expect(getMock).not.toHaveBeenCalled();
    expect(abandonWaitingGameSession).not.toHaveBeenCalled();
  });
});
