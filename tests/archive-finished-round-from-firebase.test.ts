import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryFetchSessionWordMaps = vi.fn();
const getFinishedRoundArchive = vi.fn();
const isFinishedArchiveStale = vi.fn();
const isLegacyFinishedArchiveWords = vi.fn();
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
  isLegacyFinishedArchiveWords: (...args: unknown[]) => isLegacyFinishedArchiveWords(...args),
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
    isLegacyFinishedArchiveWords.mockReturnValue(false);
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
    expect(saveFinishedRoundArchive).toHaveBeenCalledWith(
      'ABCDE',
      expect.objectContaining({
        wordPlayers: { кіт: { org: true }, пес: { p2: true } },
      }),
      expect.any(Map),
    );
  });

  it('merges options.wordPlayers with fetch and keeps richer server tree', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: {
        wordPlayers: {
          кіт: { org: true },
          пес: { p2: true },
          ліс: { org: true },
        },
      },
    });
    const session = finishedSession();
    session.wordPlayers = {};

    await archiveFinishedRoundFromFirebase('ABCDE', session, {
      wordPlayers: { кіт: { org: true } },
    });

    expect(tryFetchSessionWordMaps).toHaveBeenCalled();
    expect(saveFinishedRoundArchive).toHaveBeenCalledWith(
      'ABCDE',
      expect.objectContaining({
        wordPlayers: {
          кіт: { org: true },
          пес: { p2: true },
          ліс: { org: true },
        },
      }),
      expect.any(Map),
    );
  });

  it('keeps richer memory when fetch is thinner (stale cache)', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { кіт: { org: true } } },
    });
    const session = finishedSession();
    session.wordPlayers = { кіт: { org: true }, пес: { p2: true } };

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(tryFetchSessionWordMaps).toHaveBeenCalled();
    expect(saveFinishedRoundArchive).toHaveBeenCalledWith(
      'ABCDE',
      expect.objectContaining({
        wordPlayers: { кіт: { org: true }, пес: { p2: true } },
      }),
      expect.any(Map),
    );
  });

  it('saves from memory when fetch fails but memory claims words', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
    const session = finishedSession();
    session.wordPlayers = { кіт: { org: true }, пес: { p2: true } };

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(saveFinishedRoundArchive).toHaveBeenCalledWith(
      'ABCDE',
      expect.objectContaining({
        wordPlayers: { кіт: { org: true }, пес: { p2: true } },
      }),
      expect.any(Map),
    );
  });

  it('does not save an empty archive when maps fetch fails and memory is empty', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
    const session = finishedSession();
    session.wordPlayers = {};

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
  });

  it('does not overwrite with empty fetch when existing archive claims words', async () => {
    getFinishedRoundArchive.mockResolvedValue({
      gameId: 'ABCDE',
      baseWordRound: 0,
      savedAt: 1,
      session: finishedSession(),
      playerWords: { org: ['кіт'] },
    });
    isFinishedArchiveStale.mockReturnValue(true);
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    const session = finishedSession();
    session.wordPlayers = {};

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(tryFetchSessionWordMaps).toHaveBeenCalled();
    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
  });

  it('saves a valid empty archive when maps fetch is empty and nothing claims words', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    const session = finishedSession();
    session.wordPlayers = {};

    await archiveFinishedRoundFromFirebase('ABCDE', session);

    expect(saveFinishedRoundArchive).toHaveBeenCalledWith(
      'ABCDE',
      expect.objectContaining({ wordPlayers: {} }),
      expect.any(Map),
    );
  });
});
