import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSessionPlayerWords = vi.fn();
const persistLocalArchive = vi.fn();
const finalizeOnlineRoundForPlayer = vi.fn();
const clearPendingRoundArchive = vi.fn();
const getFinishedRoundArchive = vi.fn();
const isFinishedArchiveStale = vi.fn();
const saveFinishedRoundArchive = vi.fn();
const getMock = vi.fn();

vi.mock('../lib/firebase/player-words-service.js', () => ({
  fetchSessionPlayerWords: (...args: unknown[]) => fetchSessionPlayerWords(...args),
}));

vi.mock('../lib/online/coordinated-session-cleanup.js', () => ({
  persistLocalArchive: (...args: unknown[]) => persistLocalArchive(...args),
}));

vi.mock('../lib/online/finalize-online-round.js', () => ({
  finalizeOnlineRoundForPlayer: (...args: unknown[]) => finalizeOnlineRoundForPlayer(...args),
}));

vi.mock('../lib/online/pending-round-archive.js', () => ({
  clearPendingRoundArchive: (...args: unknown[]) => clearPendingRoundArchive(...args),
}));

vi.mock('../lib/online/online-session-archive.js', () => ({
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
} from '../lib/online/complete-pending-round-archive.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

const words = new Map([['org', new Map([['порт', { display: 'порт', at: 100 }]])]]);

describe('complete-pending-round-archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistLocalArchive.mockResolvedValue(undefined);
    finalizeOnlineRoundForPlayer.mockResolvedValue(undefined);
    clearPendingRoundArchive.mockResolvedValue(undefined);
    fetchSessionPlayerWords.mockResolvedValue(words);
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    isFinishedArchiveStale.mockReturnValue(false);
  });

  it('persists local archive and player stats once for a finished round', async () => {
    const session = finishedSession();

    await persistFinishedRoundForPlayer('ABCD', 'org', session, words);

    expect(persistLocalArchive).toHaveBeenCalledWith('ABCD', 'org', session, words);
    expect(finalizeOnlineRoundForPlayer).toHaveBeenCalled();
    expect(clearPendingRoundArchive).toHaveBeenCalledWith('ABCD', 0);
  });

  it('fetches words from firebase before persisting finished round', async () => {
    const session = finishedSession();

    await persistFinishedRoundFromFirebase('ABCD', 'org', session);

    expect(fetchSessionPlayerWords).toHaveBeenCalledWith('ABCD', ['org', 'p2', 'p3']);
    expect(persistLocalArchive).toHaveBeenCalled();
  });

  it('reads live session from firebase', async () => {
    const session = finishedSession();
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await expect(readLiveSession('ABCD')).resolves.toEqual(session);
  });
});
