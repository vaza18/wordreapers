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

import {
  usePlaySessionSubscriptions,
  PLAY_MAPS_UNAVAILABLE_MAX_RESUBSCRIBES,
  PLAY_MAPS_UNAVAILABLE_RETRY_MS,
} from '@/hooks/usePlaySessionSubscriptions';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import {
  beginPlayMapsRoundReset,
  createPlayMapsListenerGate,
  type PlayMapsListenerGate,
} from '@/lib/online/session/play-word-maps-apply';

function useHarness(options: {
  mapsResetNonce?: number;
  mapsRetryNonce?: number;
  mapsGateRef: RefObject<PlayMapsListenerGate>;
}) {
  const [wordMaps, setWordMaps] = useState<SessionWordMaps | null>(null);
  const [myWords, setMyWords] = useState(() => new Set<string>());
  const [sessionCore, setSessionCore] = useState<GameSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapsSyncFailed, setMapsSyncFailed] = useState(false);

  usePlaySessionSubscriptions({
    gameId: 'ABCDE',
    myUid: 'org',
    t: ((key: string) => key) as never,
    mapsGateRef: options.mapsGateRef,
    mapsResetNonce: options.mapsResetNonce ?? 0,
    mapsRetryNonce: options.mapsRetryNonce ?? 0,
    setSessionCore,
    setLoading,
    setLoadError,
    setMapsSyncFailed,
    setWordMaps,
    setMyWords,
  });

  return { wordMaps, myWords, loading, loadError, mapsSyncFailed, sessionCore };
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
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
    expect([...result.current.myWords]).toEqual(['порт']);
  });

  it('opens maps subscribe without waiting for ensureAnonymousAuth (I1)', async () => {
    let resolveAuth: ((value: { uid: string }) => void) | undefined;
    ensureAnonymousAuth.mockImplementation(
      () =>
        new Promise<{ uid: string }>((resolve) => {
          resolveAuth = resolve;
        }),
    );
    subscribeSessionWordMaps.mockImplementation(() => vi.fn());

    renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await waitFor(() => {
      expect(subscribeSessionWordMaps).toHaveBeenCalled();
    });
    // Session auth still pending — maps must not be gated on outer ensureAnonymousAuth.
    expect(resolveAuth).toBeTypeOf('function');
    resolveAuth?.({ uid: 'org' });
  });

  it('session auth reject sets loadError and clears loading (C1)', async () => {
    ensureAnonymousAuth.mockRejectedValue({ code: 'auth/network-request-failed' });
    subscribeSessionWordMaps.mockImplementation(() => vi.fn());

    const { result } = renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.loadError).toBeTruthy();
    });
    expect(subscribeGameSession).not.toHaveBeenCalled();
    // Maps still opens (auth inside subscribeSessionWordMaps).
    expect(subscribeSessionWordMaps).toHaveBeenCalled();
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
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: {} },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
    expect([...result.current.myWords]).toEqual(['порт']);
  });

  it('keeps maps on unavailable while playing', async () => {
    vi.useFakeTimers();
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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mapsListener).toBeTruthy();

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        seed: 'authoritative',
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

    // Keep last maps until remount applies a new snapshot.
    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
    expect([...result.current.myWords]).toEqual(['порт']);
    vi.useRealTimers();
  });

  it('resubscribes after post-seed unavailable so later maps can apply (I1)', async () => {
    vi.useFakeTimers();
    let subscribeCount = 0;
    let latestListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        subscribeCount += 1;
        latestListener = listener;
        return vi.fn();
      },
    );

    const { result } = renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(subscribeCount).toBe(1);

    await act(async () => {
      latestListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      latestListener?.({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(PLAY_MAPS_UNAVAILABLE_RETRY_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(subscribeCount).toBe(2);

    await act(async () => {
      latestListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true }, рот: { guest: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({
      порт: { org: true },
      рот: { guest: true },
    });
    vi.useRealTimers();
  });

  it('resubscribes after seed unavailable so later maps can apply (C2)', async () => {
    vi.useFakeTimers();
    const unsubs: Array<ReturnType<typeof vi.fn>> = [];
    let subscribeCount = 0;
    let latestListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        subscribeCount += 1;
        latestListener = listener;
        const unsub = vi.fn();
        unsubs.push(unsub);
        return unsub;
      },
    );

    const { result } = renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(subscribeCount).toBe(1);

    await act(async () => {
      latestListener?.({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(PLAY_MAPS_UNAVAILABLE_RETRY_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(subscribeCount).toBe(2);
    expect(unsubs[0]).toHaveBeenCalled();

    await act(async () => {
      latestListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
    vi.useRealTimers();
  });

  it('stops auto-remount after max resubscribes; session snapshot does not clear fail-loud; Retry remounts', async () => {
    vi.useFakeTimers();
    let subscribeCount = 0;
    let latestListener: ((event: unknown) => void) | null = null;
    let sessionListener: ((session: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        subscribeCount += 1;
        latestListener = listener;
        return vi.fn();
      },
    );
    subscribeGameSession.mockImplementation(
      (_gameId: string, listener: (session: unknown) => void) => {
        sessionListener = listener;
        return vi.fn();
      },
    );

    const { result, rerender } = renderHook(
      ({ mapsRetryNonce }: { mapsRetryNonce: number }) => {
        const mapsGateRef = useRef(createPlayMapsListenerGate());
        return useHarness({ mapsGateRef, mapsRetryNonce });
      },
      { initialProps: { mapsRetryNonce: 0 } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Exhaust fast retries (epochs 0..MAX-1 → remounts), then fail-loud without further auto-remount.
    for (let i = 0; i < PLAY_MAPS_UNAVAILABLE_MAX_RESUBSCRIBES; i += 1) {
      await act(async () => {
        latestListener?.({ type: 'unavailable', reason: 'error' });
        await Promise.resolve();
        await Promise.resolve();
        vi.advanceTimersByTime(PLAY_MAPS_UNAVAILABLE_RETRY_MS);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(subscribeCount).toBe(PLAY_MAPS_UNAVAILABLE_MAX_RESUBSCRIBES + 1);

    await act(async () => {
      latestListener?.({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.mapsSyncFailed).toBe(true);
    expect(result.current.loadError).toBeNull();

    // Session presence/timer ticks must not wipe maps fail-loud (shared loadError bug).
    await act(async () => {
      sessionListener?.({
        id: 'ABCDE',
        status: 'playing',
        players: { org: { name: 'Org', online: true } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.mapsSyncFailed).toBe(true);

    const countAtExhaust = subscribeCount;
    await act(async () => {
      // Former exhausted cadence (5s) must not remount after fail-loud.
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Permanent PD must not keep remounting every 5s after fail-loud.
    expect(subscribeCount).toBe(countAtExhaust);

    const countBeforeManualRetry = subscribeCount;
    await act(async () => {
      rerender({ mapsRetryNonce: 1 });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Keep fail-loud until authoritative (roster hung-cap parity — no silent remount).
    expect(result.current.mapsSyncFailed).toBe(true);
    expect(subscribeCount).toBe(countBeforeManualRetry + 1);

    await act(async () => {
      latestListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.mapsSyncFailed).toBe(false);
    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });

    vi.useRealTimers();
  });

  it('unavailable while finished fail-louds instead of silent no-remount (I1)', async () => {
    vi.useFakeTimers();
    let mapsListener: ((event: unknown) => void) | null = null;
    let sessionListener: ((session: unknown) => void) | null = null;
    let subscribeCount = 0;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        subscribeCount += 1;
        mapsListener = listener;
        return vi.fn();
      },
    );
    subscribeGameSession.mockImplementation(
      (_gameId: string, listener: (session: unknown) => void) => {
        sessionListener = listener;
        return vi.fn();
      },
    );

    const { result } = renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      sessionListener?.({
        id: 'ABCDE',
        status: 'finished',
        players: { org: { name: 'Org', online: true } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const countBefore = subscribeCount;
    await act(async () => {
      mapsListener?.({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(PLAY_MAPS_UNAVAILABLE_RETRY_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(subscribeCount).toBe(countBefore);
    expect(result.current.mapsSyncFailed).toBe(true);
    expect(result.current.loadError).toBeNull();
    vi.useRealTimers();
  });

  it('Retry remounts with fresh epoch so first unavailable is not instantly fail-loud', async () => {
    vi.useFakeTimers();
    let subscribeCount = 0;
    let latestListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        subscribeCount += 1;
        latestListener = listener;
        return vi.fn();
      },
    );

    const { result, rerender } = renderHook(
      ({ mapsRetryNonce }: { mapsRetryNonce: number }) => {
        const mapsGateRef = useRef(createPlayMapsListenerGate());
        return useHarness({ mapsGateRef, mapsRetryNonce });
      },
      { initialProps: { mapsRetryNonce: 0 } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    for (let i = 0; i < PLAY_MAPS_UNAVAILABLE_MAX_RESUBSCRIBES; i += 1) {
      await act(async () => {
        latestListener?.({ type: 'unavailable', reason: 'error' });
        await Promise.resolve();
        await Promise.resolve();
        vi.advanceTimersByTime(PLAY_MAPS_UNAVAILABLE_RETRY_MS);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    await act(async () => {
      latestListener?.({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.mapsSyncFailed).toBe(true);

    const countAtRetry = subscribeCount;
    await act(async () => {
      rerender({ mapsRetryNonce: 1 });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Banner stays until authoritative; epoch reset still remounts once.
    expect(result.current.mapsSyncFailed).toBe(true);
    // Atomic reset: one remount with epoch 0 — not exhausted-then-reset double remount.
    expect(subscribeCount).toBe(countAtRetry + 1);

    await act(async () => {
      latestListener?.({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Fresh budget: epoch 0 unavailable schedules remount (not instant re-exhaust).
    expect(result.current.mapsSyncFailed).toBe(true);
    const countAfterFirstUnavailable = subscribeCount;
    await act(async () => {
      vi.advanceTimersByTime(PLAY_MAPS_UNAVAILABLE_RETRY_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(subscribeCount).toBe(countAfterFirstUnavailable + 1);

    vi.useRealTimers();
  });

  it('does not resubscribe session when maps listen remounts after unavailable (I1)', async () => {
    vi.useFakeTimers();
    const sessionUnsub = vi.fn();
    subscribeGameSession.mockReturnValue(sessionUnsub);

    let mapsListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        mapsListener = listener;
        return vi.fn();
      },
    );

    renderHook(() => {
      const mapsGateRef = useRef(createPlayMapsListenerGate());
      return useHarness({ mapsGateRef });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mapsListener?.({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(PLAY_MAPS_UNAVAILABLE_RETRY_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionUnsub).not.toHaveBeenCalled();
    vi.useRealTimers();
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
        seed: 'authoritative',
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
        seed: 'authoritative',
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
        seed: 'authoritative',
        maps: { wordPlayers: { нове: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ нове: { org: true } });
  });

  it('provisional empty during awaitingEmptySync does not clear wipe latch (C1)', async () => {
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));

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

    await waitFor(() => {
      expect(mapsListener).toBeTruthy();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        seed: 'provisional',
        maps: { wordPlayers: {} },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mapsGateRef.current.awaitingEmptySync).toBe(true);
    expect(result.current.wordMaps).toBeNull();

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mapsGateRef.current.awaitingEmptySync).toBe(true);
    expect(result.current.wordMaps).toBeNull();

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: {} },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mapsGateRef.current.awaitingEmptySync).toBe(false);
    expect(result.current.wordMaps?.wordPlayers).toEqual({});
  });

  it('ignores provisional-rich then applies smaller authoritative seed (play C1)', async () => {
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));

    let mapsListener: ((event: unknown) => void) | null = null;
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        mapsListener = listener;
        return vi.fn();
      },
    );

    const mapsGateRef = { current: createPlayMapsListenerGate() };

    const { result } = renderHook(() =>
      useHarness({
        mapsResetNonce: 0,
        mapsGateRef,
      }),
    );

    await waitFor(() => {
      expect(mapsListener).toBeTruthy();
    });

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        seed: 'provisional',
        maps: { wordPlayers: { порт: { org: true }, рот: { peer: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.wordMaps).toBeNull();

    await act(async () => {
      mapsListener?.({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordMaps?.wordPlayers).toEqual({ порт: { org: true } });
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
