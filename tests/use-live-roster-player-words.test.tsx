// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeSessionWordMaps = vi.fn();
const tryFetchSessionWordMaps = vi.fn();

vi.mock('@/lib/firebase/session-word-maps-service', () => ({
  subscribeSessionWordMaps: (...args: unknown[]) => subscribeSessionWordMaps(...args),
  tryFetchSessionWordMaps: (...args: unknown[]) => tryFetchSessionWordMaps(...args),
  ROSTER_WORD_MAPS_SEED_GET_MAX_ATTEMPTS: 3,
}));

import {
  useLiveRosterPlayerWords,
  ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS,
  ROSTER_MAPS_UNAVAILABLE_RETRY_MS,
} from '@/hooks/useLiveRosterPlayerWords';

/** Historical — must not complete bootstrap (provisional-as-final regression). */
const HISTORICAL_BOOTSTRAP_ESCAPE_MS = 8_000;

function emitSnapshot(
  listener: (event: unknown) => void,
  maps: unknown,
  seed: 'provisional' | 'authoritative' = 'authoritative',
) {
  listener({ type: 'snapshot', seed, maps });
}

describe('useLiveRosterPlayerWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { порт: { org: true } } },
    });
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        emitSnapshot(listener, { wordPlayers: { порт: { org: true } } });
        return vi.fn();
      },
    );
  });

  it('does not subscribe when disabled and does not mark bootstrap complete', () => {
    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: false,
      }),
    );

    expect(subscribeSessionWordMaps).not.toHaveBeenCalled();
    expect(tryFetchSessionWordMaps).not.toHaveBeenCalled();
    expect(result.current.wordsBootstrapComplete).toBe(false);
  });

  it('disabled→enabled clears stale bootstrap until a maps event', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useLiveRosterPlayerWords({
          gameId: 'ABCDE',
          rosterPlayerIds: enabled ? ['org'] : [],
          enabled,
        }),
      { initialProps: { enabled: false } },
    );

    expect(result.current.wordsBootstrapComplete).toBe(false);

    act(() => {
      rerender({ enabled: true });
    });

    // Same tick / first enabled paint: must not stay complete from a prior disable.
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.liveWords.size).toBe(0);

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
  });

  it('subscribes and inverts maps when enabled with a roster', async () => {
    const maps = { wordPlayers: { порт: { org: true }, рот: { a: true } } };
    const unsub = vi.fn();
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps });
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        emitSnapshot(listener, maps);
        return unsub;
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org', 'a'],
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.wordsBootstrapComplete).toBe(true);
    });

    expect(subscribeSessionWordMaps).toHaveBeenCalledWith(
      'ABCDE',
      expect.any(Function),
      expect.objectContaining({ seedGetMaxAttempts: 3 }),
    );
    expect(tryFetchSessionWordMaps).toHaveBeenCalledWith('ABCDE');
    expect(result.current.liveWordMaps?.wordPlayers).toEqual(maps.wordPlayers);
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
  });

  it('ignores a slow bootstrap fetch after the listener has applied', async () => {
    let resolveFetch: (result: {
      ok: true;
      maps: { wordPlayers: Record<string, Record<string, boolean>> };
    }) => void = () => undefined;
    tryFetchSessionWordMaps.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        emitSnapshot(listener, { wordPlayers: { порт: { org: true } } });
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.liveWords.get('org')).toEqual(['порт']);
    });

    await act(async () => {
      resolveFetch({
        ok: true,
        maps: { wordPlayers: { рот: { org: true } } },
      });
      await Promise.resolve();
    });

    expect(result.current.liveWords.get('org')).toEqual(['порт']);
  });

  it('fetch fail does not complete bootstrap; later listener snapshot applies words', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(tryFetchSessionWordMaps).toHaveBeenCalled();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.liveWords.size).toBe(0);

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
  });

  it('does not complete bootstrap after escape timeout when fetch fails and listener is silent', async () => {
    vi.useFakeTimers();
    try {
      tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
      subscribeSessionWordMaps.mockImplementation(() => vi.fn());

      const { result } = renderHook(() =>
        useLiveRosterPlayerWords({
          gameId: 'ABCDE',
          rosterPlayerIds: ['org'],
          enabled: true,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.wordsBootstrapComplete).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(HISTORICAL_BOOTSTRAP_ESCAPE_MS);
        await Promise.resolve();
      });

      expect(result.current.wordsBootstrapComplete).toBe(false);
      expect(result.current.liveWords.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries once on unavailable then sets mapsUnavailable (I3)', async () => {
    vi.useFakeTimers();
    try {
      let subscribeCount = 0;
      tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
      subscribeSessionWordMaps.mockImplementation(
        (_gameId: string, next: (event: unknown) => void) => {
          subscribeCount += 1;
          next({ type: 'unavailable', reason: 'error' });
          return vi.fn();
        },
      );

      const { result } = renderHook(() =>
        useLiveRosterPlayerWords({
          gameId: 'ABCDE',
          rosterPlayerIds: ['org'],
          enabled: true,
        }),
      );

      expect(subscribeCount).toBe(1);
      expect(result.current.wordsBootstrapComplete).toBe(false);
      expect(result.current.mapsUnavailable).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
        await Promise.resolve();
      });

      expect(subscribeCount).toBe(2);
      expect(result.current.mapsUnavailable).toBe(true);
      expect(result.current.wordsBootstrapComplete).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retryMapsListen remounts subscribe after mapsUnavailable (I2)', async () => {
    vi.useFakeTimers();
    try {
      let subscribeCount = 0;
      tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
      subscribeSessionWordMaps.mockImplementation(
        (_gameId: string, next: (event: unknown) => void) => {
          subscribeCount += 1;
          next({ type: 'unavailable', reason: 'error' });
          return vi.fn();
        },
      );

      const { result } = renderHook(() =>
        useLiveRosterPlayerWords({
          gameId: 'ABCDE',
          rosterPlayerIds: ['org'],
          enabled: true,
        }),
      );

      await act(async () => {
        vi.advanceTimersByTime(ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
        await Promise.resolve();
      });
      expect(result.current.mapsUnavailable).toBe(true);
      expect(subscribeCount).toBe(2);

      await act(async () => {
        result.current.retryMapsListen();
        await Promise.resolve();
      });
      // Remount + auto retry epoch may fire another unavailable immediately.
      await act(async () => {
        vi.advanceTimersByTime(ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
        await Promise.resolve();
      });
      expect(subscribeCount).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not complete bootstrap on unavailable; late snapshot after retry can still apply', async () => {
    vi.useFakeTimers();
    try {
      let subscribeCount = 0;
      let listener: ((event: unknown) => void) | null = null;
      tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
      subscribeSessionWordMaps.mockImplementation(
        (_gameId: string, next: (event: unknown) => void) => {
          subscribeCount += 1;
          listener = next;
          if (subscribeCount === 1) {
            next({ type: 'unavailable', reason: 'permission_denied' });
          }
          return vi.fn();
        },
      );

      const { result } = renderHook(() =>
        useLiveRosterPlayerWords({
          gameId: 'ABCDE',
          rosterPlayerIds: ['org'],
          enabled: true,
        }),
      );

      expect(result.current.wordsBootstrapComplete).toBe(false);
      expect(result.current.mapsUnavailable).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
        await Promise.resolve();
      });
      expect(subscribeCount).toBe(2);
      expect(result.current.mapsUnavailable).toBe(false);

      await act(async () => {
        emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
        await Promise.resolve();
      });

      expect(result.current.wordsBootstrapComplete).toBe(true);
      expect(result.current.mapsUnavailable).toBe(false);
      expect(result.current.liveWords.get('org')).toEqual(['порт']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies maps and inverted words atomically (I5)', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org', 'guest'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(
        listener!,
        { wordPlayers: { порт: { org: true }, ретро: { guest: true } } },
        'authoritative',
      );
      await Promise.resolve();
    });

    expect(result.current.liveWordMaps?.wordPlayers).toEqual({
      порт: { org: true },
      ретро: { guest: true },
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(result.current.liveWords.get('guest')).toEqual(['ретро']);

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });

    // Grow-only keeps both maps and words in sync (no maps-only / words-only split).
    expect(result.current.liveWordMaps?.wordPlayers).toEqual({
      порт: { org: true },
      ретро: { guest: true },
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(result.current.liveWords.get('guest')).toEqual(['ретро']);
  });

  it('ignores provisional snapshot until authoritative (results C1 / no provisional UI)', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org', 'guest'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } }, 'provisional');
      await Promise.resolve();
    });

    expect(result.current.liveWords.size).toBe(0);
    expect(result.current.wordsBootstrapComplete).toBe(false);

    await act(async () => {
      emitSnapshot(
        listener!,
        {
          wordPlayers: {
            порт: { org: true },
            ретро: { guest: true },
          },
        },
        'authoritative',
      );
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(result.current.liveWords.get('guest')).toEqual(['ретро']);
  });

  it('first authoritative empty applies open SoT (rematch wipe; no provisional peak)', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(
        listener!,
        { wordPlayers: { порт: { org: true }, рот: { org: true } } },
        'provisional',
      );
      await Promise.resolve();
    });
    expect(result.current.liveWords.size).toBe(0);
    expect(result.current.wordsBootstrapComplete).toBe(false);

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });

    // Empty listen waits for fetch settle; short delays must not complete bootstrap.
    expect(result.current.wordsBootstrapComplete).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.mapsUnavailable).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS);
      await Promise.resolve();
    });

    // Hung-cap → fail-loud CTA, not empty bootstrap (would close rematch-survival).
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.mapsUnavailable).toBe(true);
    expect(result.current.liveWords.size).toBe(0);
    vi.useRealTimers();
  });

  it('applies delayed non-empty fetch after empty authoritative listen (C1 wipe race)', async () => {
    let listener: ((event: unknown) => void) | null = null;
    let resolveFetch: (value: {
      ok: true;
      maps: { wordPlayers: Record<string, Record<string, boolean>> };
    }) => void = () => undefined;
    tryFetchSessionWordMaps.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.liveWords.size).toBe(0);

    await act(async () => {
      resolveFetch({
        ok: true,
        maps: { wordPlayers: { порт: { org: true }, ретро: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);
  });

  it('empty authoritative + unavailable while fetch in flight remounts without empty preserve (C1)', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    let subscribeCount = 0;
    const fetchResolvers: Array<
      (value: { ok: true; maps: { wordPlayers: Record<string, Record<string, boolean>> } }) => void
    > = [];
    tryFetchSessionWordMaps.mockImplementation(
      () =>
        new Promise((resolve) => {
          fetchResolvers.push(resolve);
        }),
    );
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        subscribeCount += 1;
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    expect(fetchResolvers).toHaveLength(1);

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);

    await act(async () => {
      listener!({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
      await Promise.resolve();
    });

    // Remount without preserving empty SoT — new subscribe + new bootstrap fetch.
    expect(subscribeCount).toBe(2);
    expect(fetchResolvers).toHaveLength(2);
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.mapsUnavailable).toBe(false);

    // First fetch settle after cancel must not lock empty bootstrap.
    await act(async () => {
      fetchResolvers[0]!({
        ok: true,
        maps: { wordPlayers: { порт: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);

    await act(async () => {
      fetchResolvers[1]!({
        ok: true,
        maps: { wordPlayers: { порт: { org: true }, ретро: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);
    expect(result.current.mapsUnavailable).toBe(false);
    vi.useRealTimers();
  });

  it('keeps bootstrap open past former short grace so late rich fetch still applies', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    let resolveFetch: (value: {
      ok: true;
      maps: { wordPlayers: Record<string, Record<string, boolean>> };
    }) => void = () => undefined;
    tryFetchSessionWordMaps.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });

    // Former 1.5s grace must not complete bootstrap / cancel in-flight fetch.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);

    await act(async () => {
      resolveFetch({
        ok: true,
        maps: { wordPlayers: { порт: { org: true }, ретро: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);
    vi.useRealTimers();
  });

  it('hung-cap sets mapsUnavailable without completing empty bootstrap; late rich still applies', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    let resolveFetch: (value: {
      ok: true;
      maps: { wordPlayers: Record<string, Record<string, boolean>> };
    }) => void = () => undefined;
    tryFetchSessionWordMaps.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS);
      await Promise.resolve();
    });
    expect(result.current.mapsUnavailable).toBe(true);
    expect(result.current.wordsBootstrapComplete).toBe(false);

    await act(async () => {
      resolveFetch({
        ok: true,
        maps: { wordPlayers: { порт: { org: true }, ретро: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.mapsUnavailable).toBe(false);
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);
    vi.useRealTimers();
  });

  it('hung-cap Retry keeps CTA without remount; late rich still applies (I4/C1)', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    let subscribeCount = 0;
    const fetchResolvers: Array<
      (value: { ok: true; maps: { wordPlayers: Record<string, Record<string, boolean>> } }) => void
    > = [];
    let fetchCalls = 0;
    tryFetchSessionWordMaps.mockImplementation(
      () =>
        new Promise((resolve) => {
          fetchCalls += 1;
          fetchResolvers.push(resolve);
        }),
    );
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        subscribeCount += 1;
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS);
      await Promise.resolve();
    });
    expect(result.current.mapsUnavailable).toBe(true);
    const countAtHung = subscribeCount;
    const fetchesAtHung = fetchCalls;

    await act(async () => {
      result.current.retryMapsListen();
      await Promise.resolve();
    });
    // C1: keep fail-loud CTA (Home escape) — do not drop into naked survival spinner.
    expect(result.current.mapsUnavailable).toBe(true);
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(subscribeCount).toBe(countAtHung);
    expect(fetchCalls).toBeGreaterThan(fetchesAtHung);

    // I4: primary in-flight fetch (index 0) still seals late rich after Retry kick.
    await act(async () => {
      fetchResolvers[0]!({
        ok: true,
        maps: { wordPlayers: { порт: { org: true }, ретро: { org: true } } },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.mapsUnavailable).toBe(false);
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);
    vi.useRealTimers();
  });

  it('hung-cap Retry with never-settling fetch keeps mapsUnavailable CTA (C1)', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS);
      await Promise.resolve();
    });
    expect(result.current.mapsUnavailable).toBe(true);

    await act(async () => {
      result.current.retryMapsListen();
      await Promise.resolve();
    });
    expect(result.current.mapsUnavailable).toBe(true);
    expect(result.current.wordsBootstrapComplete).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS);
      await Promise.resolve();
    });
    expect(result.current.mapsUnavailable).toBe(true);
    vi.useRealTimers();
  });

  it('hung-cap Retry spam starts at most one kick tryFetch in flight (I4)', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    let fetchCalls = 0;
    tryFetchSessionWordMaps.mockImplementation(() => {
      fetchCalls += 1;
      return new Promise(() => undefined);
    });
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS);
      await Promise.resolve();
    });
    const fetchesAtHung = fetchCalls;

    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        result.current.retryMapsListen();
      }
      await Promise.resolve();
    });
    // Primary + one kick; spam must not pile more while kick is in flight.
    expect(fetchCalls).toBe(fetchesAtHung + 1);
    vi.useRealTimers();
  });

  it('post-bootstrap unavailable remounts once preserving SoT then fail-loud (I1)', async () => {
    vi.useFakeTimers();
    let listener: ((event: unknown) => void) | null = null;
    let subscribeCount = 0;
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { порт: { org: true } } },
    });
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        subscribeCount += 1;
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } }, 'authoritative');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(subscribeCount).toBe(1);

    await act(async () => {
      listener!({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
      await Promise.resolve();
    });
    expect(subscribeCount).toBe(2);
    // SoT preserved across remount — not wiped to empty.
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(result.current.wordsBootstrapComplete).toBe(true);

    await act(async () => {
      listener!({ type: 'unavailable', reason: 'error' });
      await Promise.resolve();
    });
    expect(result.current.mapsUnavailable).toBe(true);
    // CTA gates need incomplete bootstrap; SoT words stay for Retry remount preserve.
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.liveWords.get('org')).toEqual(['порт']);

    const countAtCta = subscribeCount;
    await act(async () => {
      result.current.retryMapsListen();
      await Promise.resolve();
    });
    // Manual Retry preserves SoT — no empty flash / no spinner window (bootstrap stays complete).
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.mapsUnavailable).toBe(false);
    expect(subscribeCount).toBeGreaterThan(countAtCta);
    vi.useRealTimers();
  });

  it('non-empty fetch is open SoT and ignores later empty listen', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { порт: { org: true }, ретро: { org: true } } },
    });
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } }, 'provisional');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.wordsBootstrapComplete).toBe(true);
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} }, 'authoritative');
      await Promise.resolve();
    });

    // Later authoritative empty is grow-only — keep fetch SoT peak.
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);
  });

  it('empty fetch does not complete bootstrap until authoritative listen (I3)', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockResolvedValue({ ok: true, maps: { wordPlayers: {} } });
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } }, 'provisional');
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(tryFetchSessionWordMaps).toHaveBeenCalled();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.liveWords.size).toBe(0);

    await act(async () => {
      emitSnapshot(
        listener!,
        { wordPlayers: { порт: { org: true }, ретро: { org: true } } },
        'authoritative',
      );
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'ретро']);
  });

  it('blocks empty clears over a richer snapshot (grow-only from first non-empty)', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        emitSnapshot(next, { wordPlayers: { порт: { org: true }, рот: { org: true } } });
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org'],
        enabled: true,
      }),
    );

    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);

    act(() => {
      emitSnapshot(listener!, { wordPlayers: {} });
    });

    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
  });

  it('keeps full rich through progressive rematch wipe shrinks then empty', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        emitSnapshot(next, {
          wordPlayers: { порт: { org: true }, рот: { org: true }, тор: { guest: true } },
        });
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org', 'guest'],
        enabled: true,
      }),
    );

    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
    expect(result.current.liveWords.get('guest')).toEqual(['тор']);

    act(() => {
      emitSnapshot(listener!, {
        wordPlayers: { порт: { org: true }, рот: { org: true } },
      });
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
    expect(result.current.liveWords.get('guest')).toEqual(['тор']);

    act(() => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);

    act(() => {
      emitSnapshot(listener!, { wordPlayers: {} });
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
    expect(result.current.liveWordMaps?.wordPlayers).toEqual({
      порт: { org: true },
      рот: { org: true },
      тор: { guest: true },
    });
  });

  it('keeps first applied peak through mid-wipe from null (no open empty window)', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org', 'guest'],
        enabled: true,
      }),
    );

    act(() => {
      emitSnapshot(listener!, {
        wordPlayers: { порт: { org: true }, рот: { org: true }, тор: { guest: true } },
      });
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
    expect(result.current.liveWords.get('guest')).toEqual(['тор']);

    act(() => {
      emitSnapshot(listener!, {
        wordPlayers: { порт: { org: true }, рот: { org: true } },
      });
    });
    act(() => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
    });
    act(() => {
      emitSnapshot(listener!, { wordPlayers: {} });
    });

    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
    expect(result.current.liveWords.get('guest')).toEqual(['тор']);
    expect(result.current.liveWordMaps?.wordPlayers).toEqual({
      порт: { org: true },
      рот: { org: true },
      тор: { guest: true },
    });
  });

  it('does not resubscribe when rosterPlayerIds change while enabled', async () => {
    const unsub = vi.fn();
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        emitSnapshot(listener, { wordPlayers: { порт: { org: true } } });
        return unsub;
      },
    );

    const { rerender } = renderHook(
      ({ roster }) =>
        useLiveRosterPlayerWords({
          gameId: 'ABCDE',
          rosterPlayerIds: roster,
          enabled: true,
        }),
      { initialProps: { roster: ['org'] } },
    );

    await waitFor(() => {
      expect(subscribeSessionWordMaps).toHaveBeenCalledTimes(1);
    });

    act(() => {
      rerender({ roster: ['org', 'a'] });
    });

    expect(subscribeSessionWordMaps).toHaveBeenCalledTimes(1);
    expect(unsub).not.toHaveBeenCalled();
  });

  it('replaces a richer prior room when gameId changes even if next is smaller', async () => {
    subscribeSessionWordMaps.mockImplementation(
      (gameId: string, listener: (event: unknown) => void) => {
        if (gameId === 'ROOM1') {
          emitSnapshot(listener, {
            wordPlayers: { порт: { org: true }, рот: { org: true }, тор: { org: true } },
          });
        } else {
          emitSnapshot(listener, { wordPlayers: { а: { org: true } } });
        }
        return vi.fn();
      },
    );

    const { result, rerender } = renderHook(
      ({ gameId }) =>
        useLiveRosterPlayerWords({
          gameId,
          rosterPlayerIds: ['org'],
          enabled: true,
        }),
      { initialProps: { gameId: 'ROOM1' } },
    );

    await waitFor(() => {
      expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот', 'тор']);
    });

    act(() => {
      rerender({ gameId: 'ROOM2' });
    });

    await waitFor(() => {
      expect(result.current.liveWords.get('org')).toEqual(['а']);
    });
    expect(result.current.liveWordMaps?.wordPlayers).toEqual({ а: { org: true } });
  });

  it('unsubscribes when disabled after freeze but keeps last words for rematch race', async () => {
    const unsub = vi.fn();
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, listener: (event: unknown) => void) => {
        emitSnapshot(listener, { wordPlayers: { порт: { org: true } } });
        return unsub;
      },
    );

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useLiveRosterPlayerWords({
          gameId: 'ABCDE',
          rosterPlayerIds: enabled ? ['org'] : [],
          enabled,
        }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => {
      expect(result.current.liveWords.get('org')).toEqual(['порт']);
    });

    act(() => {
      rerender({ enabled: false });
    });

    expect(unsub).toHaveBeenCalled();
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
  });

  it('applies incremental snapshot emits and blocks mid-play empty wipe', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        return vi.fn();
      },
    );

    const { result } = renderHook(() =>
      useLiveRosterPlayerWords({
        gameId: 'ABCDE',
        rosterPlayerIds: ['org', 'guest'],
        enabled: true,
      }),
    );

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
      await Promise.resolve();
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт']);

    await act(async () => {
      emitSnapshot(listener!, {
        wordPlayers: { порт: { org: true }, ретро: { guest: true } },
      });
      await Promise.resolve();
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(result.current.liveWords.get('guest')).toEqual(['ретро']);

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: {} });
      await Promise.resolve();
    });
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
    expect(result.current.liveWordMaps?.wordPlayers).toEqual({
      порт: { org: true },
      ретро: { guest: true },
    });
  });
});
