import { beforeEach, describe, expect, it, vi } from 'vitest';

const markPlayerOffline = vi.fn();
const markResultsExited = vi.fn();
const saveFinishedRoundArchive = vi.fn();
const markFinishedArchiveAckSent = vi.fn();

vi.mock('../lib/firebase/game-session-service.js', () => ({
  markPlayerOffline: (...args: unknown[]) => markPlayerOffline(...args),
}));

vi.mock('../lib/firebase/results-coordination-service.js', () => ({
  markResultsExited: (...args: unknown[]) => markResultsExited(...args),
}));

vi.mock('../lib/online/online-session-archive.js', () => ({
  saveFinishedRoundArchive: (...args: unknown[]) => saveFinishedRoundArchive(...args),
  markFinishedArchiveAckSent: (...args: unknown[]) => markFinishedArchiveAckSent(...args),
}));

import {
  markResultsExitedAndOffline,
  persistLocalArchive,
} from '../lib/online/coordinated-session-cleanup.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

const finishedSession = {
  baseWord: 'тест',
  status: 'finished' as const,
  settings: DEFAULT_SESSION_SETTINGS,
  timerEndsAt: null,
  organizerId: 'org',
  players: {
    org: { name: 'Org', wordCount: 2, score: 10, online: true },
  },
  baseWordRound: 1,
};

describe('coordinated-session-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markPlayerOffline.mockResolvedValue(undefined);
    markResultsExited.mockResolvedValue(undefined);
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    markFinishedArchiveAckSent.mockResolvedValue(undefined);
  });

  it('persists finished round archives locally', async () => {
    const words = new Map<string, Map<string, { display: string; at: number }>>();
    await persistLocalArchive('ABCDE', 'org', finishedSession, words);

    expect(saveFinishedRoundArchive).toHaveBeenCalledWith('ABCDE', finishedSession, words);
    expect(markFinishedArchiveAckSent).toHaveBeenCalledWith('ABCDE', 1);
  });

  it('skips archive persistence for non-finished sessions', async () => {
    await persistLocalArchive(
      'ABCDE',
      'org',
      { ...finishedSession, status: 'playing', timerEndsAt: Date.now() + 60_000 },
      new Map(),
    );

    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
  });

  it('marks results exited and offline when the player is still in the session', async () => {
    await markResultsExitedAndOffline('ABCDE', 'org', finishedSession);

    expect(markResultsExited).toHaveBeenCalledWith('ABCDE', 'org');
    expect(markPlayerOffline).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('ignores permission denied when marking results exited', async () => {
    const denied = new Error('Permission denied') as Error & { code: string };
    denied.code = 'PERMISSION_DENIED';
    markResultsExited.mockRejectedValueOnce(denied);

    await expect(
      markResultsExitedAndOffline('ABCDE', 'org', finishedSession),
    ).resolves.toBeUndefined();
    expect(markPlayerOffline).toHaveBeenCalledWith('ABCDE', 'org');
  });

  it('skips offline update when the player is not in the session roster', async () => {
    await markResultsExitedAndOffline('ABCDE', 'guest', {
      ...finishedSession,
      players: finishedSession.players,
    });

    expect(markResultsExited).not.toHaveBeenCalled();
    expect(markPlayerOffline).not.toHaveBeenCalled();
  });
});
