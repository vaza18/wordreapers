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

vi.mock('../lib/online/session/active-round-cache.js', () => ({
  clearAllActiveRoundCachesForGame: (...args: unknown[]) =>
    clearAllActiveRoundCachesForGame(...args),
}));

vi.mock('../lib/online/organizer-waiting-room.js', () => ({
  setOrganizerWaitingRoom: (...args: unknown[]) => setOrganizerWaitingRoom(...args),
}));

vi.mock('../lib/online/session/online-session-archive.js', () => ({
  getFinishedRoundArchive: (...args: unknown[]) => getFinishedRoundArchive(...args),
}));

import { bootstrapRematchWaitingFromArchive } from '../lib/online/rematch/bootstrap-rematch-waiting-from-archive.js';
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

  it('throws when archived organizer is missing from roster', async () => {
    getFinishedRoundArchive.mockResolvedValue({
      ...archive,
      session: {
        ...archive.session,
        organizerId: 'missing',
        players: { p2: { name: 'Two', wordCount: 0, score: 0 } },
      },
    });

    await expect(bootstrapRematchWaitingFromArchive('ABCD', 'p2', 0)).rejects.toThrow(
      'REMATCH_FAILED',
    );
  });

  it('retries through orphan shell and reuses peer waiting session', async () => {
    const peerWaiting = {
      ...archiveSession,
      status: 'waiting' as const,
      baseWordRound: 1,
    };
    getMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true, val: () => ({ players: { org: {} } }) })
      .mockResolvedValueOnce({ exists: () => true, val: () => peerWaiting });

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'org', 0);

    expect(session).toBe(peerWaiting);
    expect(clearSessionRootForRecreate).toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('transitions finished RTDB session via rematch helper', async () => {
    const peerWaiting = {
      ...archiveSession,
      status: 'waiting' as const,
      baseWordRound: 1,
    };
    getMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ ...archiveSession, status: 'finished' as const }),
      })
      .mockResolvedValueOnce({ exists: () => true, val: () => peerWaiting });

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'org', 0);

    expect(rematchFinishedSessionToWaiting).toHaveBeenCalledWith('ABCD', 'org');
    expect(session).toBe(peerWaiting);
  });

  it('throws when RTDB session is still playing', async () => {
    getMock.mockResolvedValueOnce({ exists: () => false }).mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        ...archiveSession,
        status: 'playing' as const,
      }),
    });

    await expect(bootstrapRematchWaitingFromArchive('ABCD', 'org', 0)).rejects.toThrow(
      'REMATCH_FAILED',
    );
  });

  it('reuses peer waiting session after permission denied on set', async () => {
    const peerWaiting = {
      ...archiveSession,
      status: 'waiting' as const,
      baseWordRound: 1,
    };
    const permissionDenied = Object.assign(new Error('PERMISSION_DENIED'), {
      code: 'PERMISSION_DENIED',
    });
    getMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true, val: () => peerWaiting });

    setMock.mockRejectedValueOnce(permissionDenied);

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'p2', 0);

    expect(session).toBe(peerWaiting);
    expect(setOrganizerWaitingRoom).not.toHaveBeenCalled();
  });

  it('skips organizer waiting room when a non-organizer bootstraps', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await bootstrapRematchWaitingFromArchive('ABCD', 'p2', 0);

    expect(setOrganizerWaitingRoom).not.toHaveBeenCalled();
  });

  it('treats orphan RTDB shells as absent and creates waiting session', async () => {
    getMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true, val: () => ({ players: { org: {} } }) })
      .mockResolvedValueOnce({ exists: () => false });

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'org', 0);

    expect(session.status).toBe('waiting');
    expect(setMock).toHaveBeenCalled();
  });

  it('rethrows non-permission errors while creating waiting session', async () => {
    getMock.mockResolvedValue({ exists: () => false });
    setMock.mockRejectedValue(new Error('NETWORK_ERROR'));

    await expect(bootstrapRematchWaitingFromArchive('ABCD', 'org', 0)).rejects.toThrow(
      'NETWORK_ERROR',
    );
  });

  it('retries when set is permission denied and no peer waiting session exists yet', async () => {
    const permissionDenied = Object.assign(new Error('PERMISSION_DENIED'), {
      code: 'PERMISSION_DENIED',
    });
    const peerWaiting = {
      ...archiveSession,
      status: 'waiting' as const,
      baseWordRound: 1,
    };
    getMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true, val: () => peerWaiting });

    setMock.mockRejectedValueOnce(permissionDenied);

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'org', 0);

    expect(session).toBe(peerWaiting);
  });

  it('reuses waiting session discovered on the second RTDB read', async () => {
    const peerWaiting = {
      ...archiveSession,
      status: 'waiting' as const,
      baseWordRound: 1,
    };
    getMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true, val: () => peerWaiting });

    const session = await bootstrapRematchWaitingFromArchive('ABCD', 'org', 0);

    expect(session).toBe(peerWaiting);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('throws when rematch bootstrap exhausts retries without a waiting session', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ ...archiveSession, status: 'finished' as const }),
    });
    rematchFinishedSessionToWaiting.mockResolvedValue(undefined);

    await expect(bootstrapRematchWaitingFromArchive('ABCD', 'org', 0)).rejects.toThrow(
      'REMATCH_FAILED',
    );
  });
});
