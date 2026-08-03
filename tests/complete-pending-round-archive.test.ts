import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryFetchSessionWordMaps = vi.fn();
const persistLocalArchive = vi.fn();
const finalizeOnlineRoundForPlayer = vi.fn();
const clearPendingRoundArchive = vi.fn();
const getFinishedRoundArchive = vi.fn();
const isFinishedArchiveStale = vi.fn();
const saveFinishedRoundArchive = vi.fn();
const getMock = vi.fn();

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
}));

vi.mock('../lib/online/session/online-session-archive.js', () => ({
  getFinishedRoundArchive: (...args: unknown[]) => getFinishedRoundArchive(...args),
  isFinishedArchiveStale: (...args: unknown[]) => isFinishedArchiveStale(...args),
  saveFinishedRoundArchive: (...args: unknown[]) => saveFinishedRoundArchive(...args),
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

import {
  persistFinishedRoundForPlayer,
  persistFinishedRoundFromFirebase,
  readLiveSession,
} from '../lib/online/session/complete-pending-round-archive.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

const words = new Map([['org', ['порт']]]);

describe('complete-pending-round-archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistLocalArchive.mockResolvedValue('saved');
    finalizeOnlineRoundForPlayer.mockResolvedValue(undefined);
    clearPendingRoundArchive.mockResolvedValue(undefined);
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { порт: { org: true } } },
    });
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    isFinishedArchiveStale.mockReturnValue(false);
  });

  it('persists local archive and player stats once for a finished round', async () => {
    const session = finishedSession();

    await persistFinishedRoundForPlayer('ABCDE', 'org', session, words);

    expect(persistLocalArchive).toHaveBeenCalledWith('ABCDE', 'org', session, words);
    expect(finalizeOnlineRoundForPlayer).toHaveBeenCalled();
    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCDE', 0);
  });

  it('finalizes standings from words/maps, not RTDB score/wordCount zeros', async () => {
    const session = finishedSession();
    session.players = {
      org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      p3: { name: 'Three', wordCount: 0, score: 0, online: true },
    };
    const richWords = new Map<string, string[]>([
      ['org', ['порт', 'рот']],
      ['p2', ['тест']],
    ]);

    await persistFinishedRoundForPlayer('ABCDE', 'org', session, richWords);

    expect(finalizeOnlineRoundForPlayer).toHaveBeenCalledWith(
      'ABCDE',
      0,
      'org',
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'org', wordCount: 2, score: 2 }),
        expect.objectContaining({ playerId: 'p2', wordCount: 1, score: 1 }),
      ]),
    );
  });

  it('keeps pending when archive soft-skips empty maps with wordCount', async () => {
    persistLocalArchive.mockResolvedValue('skipped_retryable');
    const session = finishedSession();

    await persistFinishedRoundForPlayer('ABCDE', 'org', session, new Map());

    expect(finalizeOnlineRoundForPlayer).not.toHaveBeenCalled();
    expect(clearPendingRoundArchive).not.toHaveBeenCalled();
  });

  it('fetches words from firebase before persisting finished round', async () => {
    const session = finishedSession();

    await persistFinishedRoundFromFirebase('ABCDE', 'org', session);

    expect(tryFetchSessionWordMaps).toHaveBeenCalledWith('ABCDE');
    expect(persistLocalArchive).toHaveBeenCalled();
  });

  it('does not persist when maps fetch fails', async () => {
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
    const session = finishedSession();

    await expect(persistFinishedRoundFromFirebase('ABCDE', 'org', session)).rejects.toThrow(
      'network',
    );

    expect(persistLocalArchive).not.toHaveBeenCalled();
    expect(finalizeOnlineRoundForPlayer).not.toHaveBeenCalled();
  });

  it('reads live session from firebase', async () => {
    const session = finishedSession();
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await expect(readLiveSession('ABCDE')).resolves.toEqual(session);
  });
});
