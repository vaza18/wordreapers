import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSessionPlayerWords = vi.fn();
const getFinishedRoundArchive = vi.fn();
const isFinishedArchiveStale = vi.fn();
const saveFinishedRoundArchive = vi.fn();

vi.mock('../lib/firebase/player-words-service.js', () => ({
  fetchSessionPlayerWords: (...args: unknown[]) => fetchSessionPlayerWords(...args),
}));

vi.mock('../lib/online/session/online-session-archive.js', () => ({
  getFinishedRoundArchive: (...args: unknown[]) => getFinishedRoundArchive(...args),
  isFinishedArchiveStale: (...args: unknown[]) => isFinishedArchiveStale(...args),
  saveFinishedRoundArchive: (...args: unknown[]) => saveFinishedRoundArchive(...args),
}));

import { archiveFinishedRoundFromFirebase } from '../lib/online/session/archive-finished-round-from-firebase.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

describe('archiveFinishedRoundFromFirebase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSessionPlayerWords.mockResolvedValue(new Map());
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    isFinishedArchiveStale.mockReturnValue(true);
  });

  it('skips non-finished sessions', async () => {
    const session = finishedSession();
    session.status = 'playing';

    await archiveFinishedRoundFromFirebase('ABCD', session);

    expect(fetchSessionPlayerWords).not.toHaveBeenCalled();
  });

  it('saves archive when missing or stale', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    const session = finishedSession();

    await archiveFinishedRoundFromFirebase('ABCD', session);

    expect(fetchSessionPlayerWords).toHaveBeenCalled();
    expect(saveFinishedRoundArchive).toHaveBeenCalledWith('ABCD', session, expect.any(Map));
  });
});
