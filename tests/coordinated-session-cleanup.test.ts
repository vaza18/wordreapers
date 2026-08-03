import { beforeEach, describe, expect, it, vi } from 'vitest';

const markPlayerOffline = vi.fn();
const markResultsExited = vi.fn();
const getFinishedRoundArchive = vi.fn();
const saveFinishedRoundArchive = vi.fn();
const markFinishedArchiveAckSent = vi.fn();

vi.mock('../lib/firebase/game-session-service.js', () => ({
  markPlayerOffline: (...args: unknown[]) => markPlayerOffline(...args),
}));

vi.mock('../lib/firebase/results-coordination-service.js', () => ({
  markResultsExited: (...args: unknown[]) => markResultsExited(...args),
}));

vi.mock('../lib/online/session/online-session-archive.js', () => ({
  getFinishedRoundArchive: (...args: unknown[]) => getFinishedRoundArchive(...args),
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
    getFinishedRoundArchive.mockResolvedValue(null);
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    markFinishedArchiveAckSent.mockResolvedValue(undefined);
  });

  it('persists finished round archives locally', async () => {
    const words = new Map<string, string[]>([['org', ['кіт', 'пес']]]);
    await expect(persistLocalArchive('ABCDE', 'org', finishedSession, words)).resolves.toBe(
      'saved',
    );

    expect(saveFinishedRoundArchive).toHaveBeenCalledWith('ABCDE', finishedSession, words);
    expect(markFinishedArchiveAckSent).toHaveBeenCalledWith('ABCDE', 1);
  });

  it('skips empty archive when session wordPlayers claim words', async () => {
    await expect(
      persistLocalArchive(
        'ABCDE',
        'org',
        { ...finishedSession, wordPlayers: { кіт: { org: true }, пес: { org: true } } },
        new Map(),
      ),
    ).resolves.toBe('skipped_retryable');

    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
    expect(markFinishedArchiveAckSent).not.toHaveBeenCalled();
  });

  it('skips archive persistence for non-finished sessions', async () => {
    await expect(
      persistLocalArchive(
        'ABCDE',
        'org',
        { ...finishedSession, status: 'playing', timerEndsAt: Date.now() + 60_000 },
        new Map(),
      ),
    ).resolves.toBe('skipped');

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
