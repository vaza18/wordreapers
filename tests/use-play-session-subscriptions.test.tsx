// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState, type RefObject } from 'react';

const subscribeGameSession = vi.fn();
const subscribeSessionWordMaps = vi.fn();
const tryFetchSessionWordMaps = vi.fn();
const clearSessionWordMaps = vi.fn();
const ensureAnonymousAuth = vi.fn();

vi.mock('@/lib/firebase/auth', () => ({
  ensureAnonymousAuth: (...args: unknown[]) => ensureAnonymousAuth(...args),
}));

vi.mock('@/lib/firebase/game-session-service', () => ({
  subscribeGameSession: (...args: unknown[]) => subscribeGameSession(...args),
  markPlayerOnline: vi.fn(),
  tryReadGameSessionSnapshot: vi.fn(),
}));

vi.mock('@/lib/firebase/session-word-maps-service', () => ({
  subscribeSessionWordMaps: (...args: unknown[]) => subscribeSessionWordMaps(...args),
  tryFetchSessionWordMaps: (...args: unknown[]) => tryFetchSessionWordMaps(...args),
  clearSessionWordMaps: (...args: unknown[]) => clearSessionWordMaps(...args),
}));

vi.mock('@/lib/online/presence/app-presence-state', () => ({
  shouldMarkPresenceOnline: () => true,
}));

vi.mock('@/lib/game/compose-resume-heal', () => ({
  shouldHealPlayUiOnAppState: () => false,
}));

vi.mock('@/lib/debug/dev-log', () => ({
  devLogAction: vi.fn(),
}));

import { usePlaySessionSubscriptions } from '@/hooks/usePlaySessionSubscriptions';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import {
  beginPlayMapsRoundReset,
  createPlayMapsListenerGate,
  type PlayMapsListenerGate,
} from '@/lib/online/session/play-word-maps-apply';

function useHarness(options: {
  mapsResetNonce?: number;
  mapsGateRef: RefObject<PlayMapsListenerGate>;
}) {
  const [wordMaps, setWordMaps] = useState<SessionWordMaps | null>(null);
  const [myWords, setMyWords] = useState(() => new Set<string>());
  const [sessionCore, setSessionCore] = useState<GameSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  usePlaySessionSubscriptions({
    gameId: 'ABCDE',
    myUid: 'org',
    t: ((key: string) => key) as never,
    mapsGateRef: options.mapsGateRef,
    mapsResetNonce: options.mapsResetNonce ?? 0,
    setSessionCore,
    setLoading,
    setLoadError,
    setWordMaps,
    setMyWords,
  });

  return { wordMaps, myWords, loading, loadError, sessionCore };
}

describe('usePlaySessionSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAnonymousAuth.mockResolvedValue({ uid: 'org' });
    subscribeGameSession.mockReturnValue(vi.fn());
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    clearSessionWordMaps.mockResolvedValue(undefined);
    subscribeSessionWordMaps.mockImplementation(() => vi.fn());
  });

  it('applies snapshot maps and own words without setState side effects', async () => {
    let mapsListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        mapsListener = listener;
        return vi.fn();
      },
    );

    const { result } = renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await waitFor(() => {
      expect(subscribeSessionWordMaps).toHaveBeenCalled();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
    expect([...result.current.myWords]).toEqual(['порт']);
  });

  it('keeps own words on mid-play empty snapshot (no score-path rollback)', async () => {
    let mapsListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        mapsListener = listener;
        return vi.fn();
      },
    );

    const { result } = renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await waitFor(() => {
      expect(mapsListener).toBeTruthy();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        maps: { wordPlayers: {} },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
    expect([...result.current.myWords]).toEqual(['порт']);
  });

  it('keeps maps on unavailable while playing', async () => {
    let mapsListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        mapsListener = listener;
        return vi.fn();
      },
    );

    const { result } = renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await waitFor(() => {
      expect(mapsListener).toBeTruthy();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mapsListener?.({ type: 'unavailable', reason: 'permission_denied' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
    expect([...result.current.myWords]).toEqual(['порт']);
  });

  it('retries force sync after rich reject then applies empty', async () => {
    tryFetchSessionWordMaps
      .mockResolvedValueOnce({
        ok: true,
        maps: { wordPlayers: { порт: { org: true } } },
      })
      .mockResolvedValueOnce({ ok: true, maps: { wordPlayers: {} } });

    const mapsGateRef = {
      current: beginPlayMapsRoundReset(createPlayMapsListenerGate()),
    };

    const { result } = renderHook(() =>
      useHarness({
        mapsResetNonce: 1,
        mapsGateRef,
      }),
    );

    await waitFor(
      () => {
        expect(tryFetchSessionWordMaps).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );

    expect(mapsGateRef.current.awaitingEmptySync).toBe(false);
    expect(result.current.wordMaps?.wordPlayers).toEqual({});
  });

  it('after rich rejects exhaust, applies empty and keeps latch until wipe', async () => {
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { нове: { org: true } } },
    });

    let mapsListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        mapsListener = listener;
        return vi.fn();
      },
    );

    const mapsGateRef = {
      current: beginPlayMapsRoundReset(createPlayMapsListenerGate()),
    };

    const { result } = renderHook(() =>
      useHarness({
        mapsResetNonce: 1,
        mapsGateRef,
      }),
    );

    await waitFor(
      () => {
        // Attempts 0..4 inclusive before exhaustion (MAPS_RESET_MAX_ATTEMPT = 4).
        expect(tryFetchSessionWordMaps.mock.calls.length).toBeGreaterThanOrEqual(5);
        expect(mapsGateRef.current.awaitingEmptySync).toBe(true);
        expect(result.current.wordMaps?.wordPlayers).toEqual({});
      },
      { timeout: 5000 },
    );

    expect(clearSessionWordMaps).toHaveBeenCalled();
    expect([...result.current.myWords]).toEqual([]);

    await waitFor(() => {
      expect(mapsListener).toBeTruthy();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        maps: { wordPlayers: { нове: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Stale/prior rich after exhaustion must not apply until wipe empty.
    expect(result.current.wordMaps?.wordPlayers).toEqual({});
    expect(mapsGateRef.current.awaitingEmptySync).toBe(true);

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        maps: { wordPlayers: {} },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({});
    expect(mapsGateRef.current.awaitingEmptySync).toBe(false);

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        maps: { wordPlayers: { нове: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ нове: { org: true } });
  });

  it('after fetch-error exhaust, applies empty and keeps latch until wipe', async () => {
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });

    const mapsGateRef = {
      current: beginPlayMapsRoundReset(createPlayMapsListenerGate()),
    };

    const { result } = renderHook(() =>
      useHarness({
        mapsResetNonce: 1,
        mapsGateRef,
      }),
    );

    await waitFor(
      () => {
        expect(tryFetchSessionWordMaps.mock.calls.length).toBeGreaterThanOrEqual(5);
        expect(mapsGateRef.current.awaitingEmptySync).toBe(true);
        expect(result.current.wordMaps?.wordPlayers).toEqual({});
      },
      { timeout: 5000 },
    );

    expect(clearSessionWordMaps).toHaveBeenCalled();
    expect([...result.current.myWords]).toEqual([]);
  });
});
