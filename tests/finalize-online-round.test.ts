import { beforeEach, describe, expect, it, vi } from 'vitest';

const wasOnlineRoundProcessed = vi.fn();
const markOnlineRoundProcessed = vi.fn();
const clearActiveRoundCacheForSession = vi.fn();
const recordOnlineRound = vi.fn();
const incrementCloudPlayerStatsIfRegistered = vi.fn();

vi.mock('../lib/online/processed-online-rounds.js', () => ({
  onlineRoundKey: (gameId: string, round: number) => `${gameId}:${round}`,
  wasOnlineRoundProcessed: (...args: unknown[]) => wasOnlineRoundProcessed(...args),
  markOnlineRoundProcessed: (...args: unknown[]) => markOnlineRoundProcessed(...args),
}));

vi.mock('../lib/online/cache-active-round.js', () => ({
  clearActiveRoundCacheForSession: (...args: unknown[]) => clearActiveRoundCacheForSession(...args),
}));

vi.mock('../lib/firebase/user-stats-service.js', () => ({
  incrementCloudPlayerStatsIfRegistered: (...args: unknown[]) =>
    incrementCloudPlayerStatsIfRegistered(...args),
}));

vi.mock('@/store/player-stats-store', () => ({
  usePlayerStatsStore: {
    getState: () => ({
      recordOnlineRound,
    }),
  },
}));

import { finalizeOnlineRoundForPlayer } from '../lib/online/finalize-online-round.js';

describe('finalizeOnlineRoundForPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wasOnlineRoundProcessed.mockResolvedValue(false);
    markOnlineRoundProcessed.mockResolvedValue(undefined);
    recordOnlineRound.mockResolvedValue(undefined);
    incrementCloudPlayerStatsIfRegistered.mockResolvedValue(undefined);
    clearActiveRoundCacheForSession.mockResolvedValue(undefined);
  });

  it('records stats once per online round', async () => {
    const standings = [
      { playerId: 'org', score: 10, wordCount: 3, uniqueCount: 2 },
      { playerId: 'guest', score: 5, wordCount: 2, uniqueCount: 1 },
    ];

    await finalizeOnlineRoundForPlayer('ABCD', 0, 'org', standings);

    expect(markOnlineRoundProcessed).toHaveBeenCalledWith('ABCD:0');
    expect(recordOnlineRound).toHaveBeenCalledWith(true, 3);
    expect(incrementCloudPlayerStatsIfRegistered).toHaveBeenCalledWith(true);
    expect(clearActiveRoundCacheForSession).toHaveBeenCalledWith('ABCD', 0);
  });

  it('skips duplicate finalization for the same round key', async () => {
    wasOnlineRoundProcessed.mockResolvedValue(true);

    await finalizeOnlineRoundForPlayer('ABCD', 0, 'org', []);

    expect(recordOnlineRound).not.toHaveBeenCalled();
  });
});
