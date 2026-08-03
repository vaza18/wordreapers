// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeSessionWordMaps = vi.fn();
const tryFetchSessionWordMaps = vi.fn();

vi.mock('@/lib/firebase/session-word-maps-service', () => ({
  subscribeSessionWordMaps: (...args: unknown[]) => subscribeSessionWordMaps(...args),
  tryFetchSessionWordMaps: (...args: unknown[]) => tryFetchSessionWordMaps(...args),
}));

import { useLiveRosterPlayerWords } from '@/hooks/useLiveRosterPlayerWords';
import { RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS } from '@/lib/online/session/should-show-online-results-words-loading';

function emitSnapshot(listener: (event: unknown) => void, maps: unknown) {
  listener({ type: 'snapshot', maps });
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

    expect(subscribeSessionWordMaps).toHaveBeenCalledWith('ABCDE', expect.any(Function));
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
        vi.advanceTimersByTime(RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS);
        await Promise.resolve();
      });

      expect(result.current.wordsBootstrapComplete).toBe(false);
      expect(result.current.liveWords.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not complete bootstrap on unavailable; late snapshot can still apply', async () => {
    let listener: ((event: unknown) => void) | null = null;
    tryFetchSessionWordMaps.mockImplementation(() => new Promise(() => undefined));
    subscribeSessionWordMaps.mockImplementation(
      (_gameId: string, next: (event: unknown) => void) => {
        listener = next;
        next({ type: 'unavailable', reason: 'permission_denied' });
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
      expect(listener).toBeTruthy();
    });
    expect(result.current.wordsBootstrapComplete).toBe(false);
    expect(result.current.liveWords.size).toBe(0);
    expect(result.current.liveWordMaps).toBeNull();

    await act(async () => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
      await Promise.resolve();
    });

    expect(result.current.wordsBootstrapComplete).toBe(true);
    expect(result.current.liveWords.get('org')).toEqual(['порт']);
  });

  it('blocks empty clears over a richer snapshot', async () => {
    let listener: ((event: unknown) => void) | null = null;
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

    await waitFor(() => {
      expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
    });

    act(() => {
      emitSnapshot(listener!, { wordPlayers: {} });
    });

    expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
  });

  it('allows non-empty shrink', async () => {
    let listener: ((event: unknown) => void) | null = null;
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

    await waitFor(() => {
      expect(result.current.liveWords.get('org')).toEqual(['порт', 'рот']);
    });

    act(() => {
      emitSnapshot(listener!, { wordPlayers: { порт: { org: true } } });
    });

    expect(result.current.liveWords.get('org')).toEqual(['порт']);
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
});
