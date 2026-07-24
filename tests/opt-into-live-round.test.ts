import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameSessionSnapshot } from '../lib/firebase/game-session-service.js';
import { optIntoLiveRound } from '../lib/online/rematch/opt-into-live-round.js';

const { readGameSessionSnapshot, tryReadGameSessionSnapshot } = vi.hoisted(() => {
  const readGameSessionSnapshot = vi.fn();
  const tryReadGameSessionSnapshot = vi.fn((gameId: string) => readGameSessionSnapshot(gameId));
  return { readGameSessionSnapshot, tryReadGameSessionSnapshot };
});

const reconcilePlayerPresence = vi.hoisted(() => vi.fn());

vi.mock('../lib/firebase/results-coordination-service.js', () => ({
  markResultsExited: vi.fn(),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  readGameSessionSnapshot,
  tryReadGameSessionSnapshot,
}));

vi.mock('../lib/online/rematch/restart-rematch-online-round.js', () => ({
  restartRematchOnlineRound: vi.fn(),
}));

vi.mock('../lib/online/presence/reconcile-player-presence.js', () => ({
  reconcilePlayerPresence: (...args: unknown[]) => reconcilePlayerPresence(...args),
}));

import { markResultsExited } from '../lib/firebase/results-coordination-service.js';
import { restartRematchOnlineRound } from '../lib/online/rematch/restart-rematch-online-round.js';

const profile = { name: 'Org', gender: 'm' as const, avatarColorIndex: 0 };

function sessionStub(
  overrides: Pick<GameSessionSnapshot, 'status' | 'baseWordRound'> & Partial<GameSessionSnapshot>,
): GameSessionSnapshot {
  return {
    id: 'ABCDE',
    organizerId: 'org',
    baseWord: 'тест',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 600_000,
    players: {},
    ...overrides,
  };
}

describe('optIntoLiveRound', () => {
  beforeEach(() => {
    vi.mocked(markResultsExited).mockReset();
    readGameSessionSnapshot.mockReset();
    tryReadGameSessionSnapshot.mockReset();
    tryReadGameSessionSnapshot.mockImplementation((gameId: string) =>
      readGameSessionSnapshot(gameId),
    );
    reconcilePlayerPresence.mockReset();
    reconcilePlayerPresence.mockResolvedValue(undefined);
    vi.mocked(restartRematchOnlineRound).mockReset();
  });

  it('restarts finished session then routes from fresh RTDB status', async () => {
    readGameSessionSnapshot
      .mockResolvedValueOnce(sessionStub({ status: 'finished', baseWordRound: 2 }))
      .mockResolvedValueOnce(sessionStub({ status: 'waiting', baseWordRound: 3 }));

    const route = await optIntoLiveRound('ABCDE', 'org', profile, 2);

    expect(restartRematchOnlineRound).toHaveBeenCalledWith('ABCDE', 'org', 2);
    expect(reconcilePlayerPresence).toHaveBeenCalledWith('ABCDE', 'org', profile);
    expect(route).toEqual({ pathname: '/online/lobby/[gameId]', params: { gameId: 'ABCDE' } });
  });

  it('bootstraps when RTDB session was purged before «Грати ще»', async () => {
    readGameSessionSnapshot.mockResolvedValueOnce(null).mockResolvedValueOnce(
      sessionStub({
        status: 'waiting',
        baseWordRound: 3,
        baseWord: '',
        organizerId: 'org',
        baseWordPickerOrder: ['org', 'p2'],
        players: {
          org: { name: 'Org', online: true, hasLeft: false, score: 0, wordCount: 0 },
        },
      }),
    );

    const route = await optIntoLiveRound('ABCDE', 'org', profile, 2);

    expect(restartRematchOnlineRound).toHaveBeenCalledWith('ABCDE', 'org', 2);
    expect(reconcilePlayerPresence).toHaveBeenCalledWith('ABCDE', 'org', profile);
    expect(route).toEqual({ pathname: '/online/pick-word/[gameId]', params: { gameId: 'ABCDE' } });
  });

  it('does not await presence when rematch lobby is already waiting', async () => {
    let resolvePresence!: () => void;
    reconcilePlayerPresence.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePresence = () => {
          resolve();
        };
      }),
    );
    readGameSessionSnapshot.mockResolvedValue(sessionStub({ status: 'waiting', baseWordRound: 3 }));

    const route = await optIntoLiveRound('ABCDE', 'p2', profile, 2);

    expect(restartRematchOnlineRound).not.toHaveBeenCalled();
    // Latch is awaited before navigate; online rejoin stays backgrounded.
    expect(markResultsExited).toHaveBeenCalledTimes(2);
    expect(reconcilePlayerPresence).toHaveBeenCalledWith('ABCDE', 'p2', profile);
    expect(route).toEqual({ pathname: '/online/lobby/[gameId]', params: { gameId: 'ABCDE' } });
    resolvePresence();
  });

  it('awaits presence when live round already started and routes to play', async () => {
    const playingSession = sessionStub({
      status: 'playing',
      baseWordRound: 3,
      liveRoundPlayerUids: ['org'],
      players: { org: { name: 'Org', online: true, hasLeft: false, score: 0, wordCount: 0 } },
    });
    let presenceResolved = false;
    reconcilePlayerPresence.mockImplementation(async () => {
      await Promise.resolve();
      presenceResolved = true;
    });
    readGameSessionSnapshot
      .mockResolvedValueOnce(playingSession)
      .mockResolvedValueOnce(playingSession);

    const route = await optIntoLiveRound('ABCDE', 'org', profile, 2);

    expect(restartRematchOnlineRound).not.toHaveBeenCalled();
    expect(presenceResolved).toBe(true);
    expect(reconcilePlayerPresence).toHaveBeenCalledWith('ABCDE', 'org', profile);
    expect(route).toEqual({ pathname: '/online/play/[gameId]', params: { gameId: 'ABCDE' } });
  });
});
