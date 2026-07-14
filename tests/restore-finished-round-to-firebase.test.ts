import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const restoreSessionWordsToRtdb = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/online/session/online-session-archive.js', () => ({
  getFinishedRoundArchive: vi.fn(),
}));

vi.mock('../lib/online/session/restore-session-words-to-rtdb.js', () => ({
  restoreSessionWordsToRtdb: (...args: unknown[]) => restoreSessionWordsToRtdb(...args),
}));

import { getFinishedRoundArchive } from '../lib/online/session/online-session-archive.js';
import { restoreFinishedRoundToFirebase } from '../lib/online/session/restore-finished-round-to-firebase.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

const archive = {
  gameId: 'ABCDE',
  baseWordRound: 0,
  savedAt: 1_000,
  ackSent: false,
  session: {
    baseWord: 'тест',
    status: 'finished' as const,
    settings: DEFAULT_SESSION_SETTINGS,
    timerEndsAt: null,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 1, score: 5, online: false },
    },
    wordPlayers: { порт: { org: true } },
  },
  playerWords: {
    org: {
      порт: { display: 'порт', at: 100 },
    },
  },
};

describe('restoreFinishedRoundToFirebase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFinishedRoundArchive).mockResolvedValue(archive);
    getMock.mockResolvedValue({ exists: () => false });
    setMock.mockResolvedValue(undefined);
    restoreSessionWordsToRtdb.mockResolvedValue(undefined);
  });

  it('recreates a deleted finished session from local archive', async () => {
    const session = await restoreFinishedRoundToFirebase('ABCDE', 0);

    expect(setMock).toHaveBeenCalled();
    expect(restoreSessionWordsToRtdb).toHaveBeenCalled();
    expect(session.status).toBe('finished');
  });

  it('returns an existing finished session without overwriting', async () => {
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        ...archive.session,
        status: 'finished',
      }),
    });

    const session = await restoreFinishedRoundToFirebase('ABCDE', 0);

    expect(setMock).not.toHaveBeenCalled();
    expect(session.status).toBe('finished');
  });

  it('throws when no local archive exists', async () => {
    vi.mocked(getFinishedRoundArchive).mockResolvedValue(null);

    await expect(restoreFinishedRoundToFirebase('ABCDE', 0)).rejects.toThrow('NO_FINISHED_ARCHIVE');
  });

  it('throws when an active playing session already exists', async () => {
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        ...archive.session,
        status: 'playing',
        timerEndsAt: Date.now() + 60_000,
      }),
    });

    await expect(restoreFinishedRoundToFirebase('ABCDE', 0)).rejects.toThrow('ROOM_NOT_RESTORABLE');
  });
});
