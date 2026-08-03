import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryFetchSessionWordMaps = vi.fn();
const getFinishedRoundArchive = vi.fn();
const isFinishedArchiveStale = vi.fn();
const saveFinishedRoundArchive = vi.fn();

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  tryFetchSessionWordMaps: (...args: unknown[]) => tryFetchSessionWordMaps(...args),
}));

vi.mock('../lib/debug/dev-log.js', () => ({
  devLogAction: vi.fn(),
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
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    isFinishedArchiveStale.mockReturnValue(true);
  });

  it('skips non-finished sessions', async () => {
    const session = finishedSession();
    session.status = 'playing';

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(tryFetchSessionWordMaps).not.toHaveBeenCalled();
  });

  it('saves archive when missing or stale', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { кіт: { org: true }, пес: { p2: true } } },
    });
    const session = finishedSession();

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(tryFetchSessionWordMaps).toHaveBeenCalled();
    expect(saveFinishedRoundArchive).toHaveBeenCalledWith('ABCDE', session, expect.any(Map));
  });

  it('does not save an empty archive when maps fetch fails', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
    const session = finishedSession();

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
  });

  it('does not overwrite with empty maps when session wordPlayers claim words', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    const session = finishedSession();
    session.wordPlayers = { кіт: { org: true }, пес: { org: true }, рік: { org: true } };

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
  });

  it('saves a valid empty archive when maps fetch is empty and nothing claims words', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    const session = finishedSession();
    session.wordPlayers = {};

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(saveFinishedRoundArchive).toHaveBeenCalledWith('ABCDE', session, expect.any(Map));
  });
});
