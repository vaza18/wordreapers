import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const clearSessionRootForRecreate = vi.fn();
const rematchFinishedSessionToWaiting = vi.fn();
const clearAllActiveRoundCachesForGame = vi.fn();
const setOrganizerWaitingRoom = vi.fn();
const getFinishedRoundArchive = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  set: (...args: unknown[]) => setMock(...args),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  clearSessionRootForRecreate: (...args: unknown[]) => clearSessionRootForRecreate(...args),
  rematchFinishedSessionToWaiting: (...args: unknown[]) => rematchFinishedSessionToWaiting(...args),
}));

vi.mock('../lib/online/active-round-cache.js', () => ({
  clearAllActiveRoundCachesForGame: (...args: unknown[]) =>
    clearAllActiveRoundCachesForGame(...args),
}));

vi.mock('../lib/online/organizer-waiting-room.js', () => ({
  setOrganizerWaitingRoom: (...args: unknown[]) => setOrganizerWaitingRoom(...args),
}));

vi.mock('../lib/online/online-session-archive.js', () => ({
  getFinishedRoundArchive: (...args: unknown[]) => getFinishedRoundArchive(...args),
}));

import { bootstrapRematchWaitingFromArchive } from '../lib/online/bootstrap-rematch-waiting-from-archive.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

const archiveSession = finishedSession();
const archive = {
  gameId: 'ABCD',
  baseWordRound: 0,
  savedAt: Date.now(),
  session: { ...archiveSession, id: 'ABCD' },
  playerWords: {},
};

describe('bootstrapRematchWaitingFromArchive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMock.mockResolvedValue(undefined);
    clearSessionRootForRecreate.mockResolvedValue(undefined);
    clearAllActiveRoundCachesForGame.mockResolvedValue(undefined);
    getFinishedRoundArchive.mockResolvedValue(archive);
  });

  it('creates a waiting session when the RTDB root is empty', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'org', 0);

    expect(session.status).toBe('waiting');
    expect(setMock).toHaveBeenCalled();
    expect(clearAllActiveRoundCachesForGame).toHaveBeenCalledWith('ABCD');
    expect(setOrganizerWaitingRoom).toHaveBeenCalledWith('ABCD');
  });

  it('reuses an existing waiting session created by a peer', async () => {
    const waiting = {
      ...archiveSession,
      status: 'waiting' as const,
      baseWord: '',
      baseWordRound: 1,
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => waiting });

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'p2', 0);

    expect(session).toBe(waiting);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('throws when the finished archive is missing', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);

    await expect(bootstrapRematchWaitingFromArchive('ABCD', 'org', 0)).rejects.toThrow(
      'NO_FINISHED_ARCHIVE',
    );
  });

  it('throws when the actor is not in the archived roster', async () => {
    await expect(bootstrapRematchWaitingFromArchive('ABCD', 'stranger', 0)).rejects.toThrow(
      'REMATCH_FAILED',
    );
  });
});
