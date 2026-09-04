import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
const onChildAddedMock = vi.fn();
const onChildChangedMock = vi.fn();
const onChildRemovedMock = vi.fn();
const ensureAnonymousAuth = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  onChildAdded: (...args: unknown[]) => onChildAddedMock(...args),
  onChildChanged: (...args: unknown[]) => onChildChangedMock(...args),
  onChildRemoved: (...args: unknown[]) => onChildRemovedMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuth(),
  getFirebaseUid: () => 'u1',
}));

const devLogAction = vi.fn();
vi.mock('../lib/debug/dev-log.js', () => ({
  devLogAction: (...args: unknown[]) => devLogAction(...args),
}));

import {
  clearSessionWordMaps,
  coalesceWordPlayersChildBuffer,
  ensureSessionWordMapsEmptyForRoundStart,
  newlyClaimedWordPlayerUids,
  requireSessionWordMaps,
  subscribeSessionWordMaps,
  tryFetchSessionWordMaps,
  wordMapsSeedRetryDelayMs,
  writeSessionWordMapsShards,
  WORD_MAPS_AUTH_TIMEOUT_MS,
  WORD_MAPS_PROVISIONAL_SEED_MS,
  WORD_MAPS_SEED_GET_MAX_ATTEMPTS,
  WORD_MAPS_SEED_GET_RETRY_MS,
  WORD_MAPS_SEED_GET_TIMEOUT_MS,
} from '../lib/firebase/session-word-maps-service.js';

/** Assert retries continue past this many settled fails (below MAX). */
const SEED_RETRY_CONTINUES_PAST_ATTEMPTS = 3;

type ChildSnap = { key: string | null; val: () => unknown };

/** Auth-first subscribe: flush microtasks so attach/seed run after ensureAnonymousAuth. */
async function flushAuthAttach(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('session-word-maps-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAnonymousAuth.mockResolvedValue({ uid: 'u1' });
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
    onChildAddedMock.mockReturnValue(vi.fn());
    onChildChangedMock.mockReturnValue(vi.fn());
    onChildRemovedMock.mockReturnValue(vi.fn());
  });

  it('newlyClaimedWordPlayerUids returns only newly true uids', () => {
    expect(newlyClaimedWordPlayerUids({ a: true }, { a: true, b: true })).toEqual(['b']);
    expect(newlyClaimedWordPlayerUids(undefined, { a: true })).toEqual(['a']);
    expect(newlyClaimedWordPlayerUids({ a: true }, { a: true })).toEqual([]);
  });

  it('returns empty maps when the shard root is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(requireSessionWordMaps('ABCDE')).resolves.toEqual({
      wordPlayers: {},
    });
    await expect(tryFetchSessionWordMaps('ABCDE')).resolves.toEqual({
      ok: true,
      maps: { wordPlayers: {} },
    });
  });

  it('requireSessionWordMaps throws when fetch fails', async () => {
    getMock.mockRejectedValue(new Error('network'));

    await expect(requireSessionWordMaps('ABCDE')).rejects.toThrow('network');
    await expect(tryFetchSessionWordMaps('ABCDE')).resolves.toMatchObject({ ok: false });
  });

  it('fetch parses true-only leaves like live child merge', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      // wordPlayers node (same shape as live seed get), not parent { wordPlayers }.
      val: () => ({ порт: { org: true, ghost: false }, ретро: { guest: true } }),
    });

    await expect(requireSessionWordMaps('ABCDE')).resolves.toEqual({
      wordPlayers: { порт: { org: true }, ретро: { guest: true } },
    });
    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('session_word_maps/ABCDE/wordPlayers'),
      }),
    );
  });

  it('writes per-word shards instead of bulk root updates', async () => {
    await writeSessionWordMapsShards('ABCDE', {
      wordPlayers: { порт: { 'org-1': true, guest: false } },
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('session_word_maps/ABCDE') }),
      {
        'wordPlayers/порт/org-1': true,
      },
    );
    expect(devLogAction).toHaveBeenCalledWith('restored session word maps', {
      room: 'ABCDE',
      details: 'shards=1',
    });
  });

  it('logs cleared session word maps after successful remove', async () => {
    await clearSessionWordMaps('ABCDE');
    expect(devLogAction).toHaveBeenCalledWith('cleared session word maps', { room: 'ABCDE' });
  });

  it('ignores permission denied when clearing word maps', async () => {
    const denied = new Error('Permission denied') as Error & { code: string };
    denied.code = 'PERMISSION_DENIED';
    removeMock.mockRejectedValueOnce(denied);

    await expect(clearSessionWordMaps('ABCDE')).resolves.toBeUndefined();
    expect(devLogAction).not.toHaveBeenCalledWith('cleared session word maps', expect.anything());
  });

  it('ensureSessionWordMapsEmptyForRoundStart verifies empty after clear', async () => {
    getMock.mockResolvedValue({ exists: () => false });
    await expect(ensureSessionWordMapsEmptyForRoundStart('ABCDE')).resolves.toBeUndefined();
    expect(removeMock).toHaveBeenCalled();
  });

  it('ensureSessionWordMapsEmptyForRoundStart fails when maps stay rich', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ порт: { org: true } }),
    });
    await expect(ensureSessionWordMapsEmptyForRoundStart('ABCDE')).rejects.toThrow(
      'SESSION_WORD_MAPS_NOT_CLEARED',
    );
  });

  describe('subscribeSessionWordMaps', () => {
    function captureChildHandlers() {
      let added: ((snap: ChildSnap) => void) | undefined;
      let changed: ((snap: ChildSnap) => void) | undefined;
      let removed: ((snap: ChildSnap) => void) | undefined;
      let cancel: ((error: Error) => void) | undefined;
      const unsubAdded = vi.fn();
      const unsubChanged = vi.fn();
      const unsubRemoved = vi.fn();

      onChildAddedMock.mockImplementation((_ref, onNext, onCancel) => {
        added = onNext as typeof added;
        cancel = onCancel as typeof cancel;
        return unsubAdded;
      });
      onChildChangedMock.mockImplementation((_ref, onNext, onCancel) => {
        changed = onNext as typeof changed;
        cancel = onCancel as typeof cancel;
        return unsubChanged;
      });
      onChildRemovedMock.mockImplementation((_ref, onNext, onCancel) => {
        removed = onNext as typeof removed;
        cancel = onCancel as typeof cancel;
        return unsubRemoved;
      });

      return {
        getHandlers: () => ({ added, changed, removed, cancel }),
        unsubAdded,
        unsubChanged,
        unsubRemoved,
      };
    }

    it('does not attach children or seed get before auth resolves (P0 cold open)', async () => {
      let resolveAuth: (user: { uid: string }) => void = () => undefined;
      ensureAnonymousAuth.mockImplementation(
        () =>
          new Promise<{ uid: string }>((resolve) => {
            resolveAuth = resolve;
          }),
      );
      getMock.mockResolvedValue({ exists: () => false, val: () => null });
      const listener = vi.fn();

      const unsub = subscribeSessionWordMaps('ABCDE', listener);
      expect(onChildAddedMock).not.toHaveBeenCalled();
      expect(getMock).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();

      resolveAuth({ uid: 'u1' });
      await flushAuthAttach();

      expect(onChildAddedMock).toHaveBeenCalled();
      expect(getMock).toHaveBeenCalled();
      unsub();
    });

    it('cancel during auth wait does not emit unavailable or attach', async () => {
      let resolveAuth: (user: { uid: string }) => void = () => undefined;
      ensureAnonymousAuth.mockImplementation(
        () =>
          new Promise<{ uid: string }>((resolve) => {
            resolveAuth = resolve;
          }),
      );
      const listener = vi.fn();
      const unsub = subscribeSessionWordMaps('ABCDE', listener);
      unsub();
      resolveAuth({ uid: 'u1' });
      await flushAuthAttach();
      expect(onChildAddedMock).not.toHaveBeenCalled();
      expect(getMock).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    });

    it('hung auth emits unavailable without attach; late resolve does not attach (I1)', async () => {
      vi.useFakeTimers();
      try {
        let resolveAuth: (user: { uid: string }) => void = () => undefined;
        ensureAnonymousAuth.mockImplementation(
          () =>
            new Promise<{ uid: string }>((resolve) => {
              resolveAuth = resolve;
            }),
        );
        const listener = vi.fn();
        const unsub = subscribeSessionWordMaps('ABCDE', listener);

        await vi.advanceTimersByTimeAsync(WORD_MAPS_AUTH_TIMEOUT_MS - 1);
        expect(listener).not.toHaveBeenCalled();
        expect(onChildAddedMock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ type: 'unavailable', reason: 'error' });
        expect(onChildAddedMock).not.toHaveBeenCalled();
        expect(getMock).not.toHaveBeenCalled();

        resolveAuth({ uid: 'u1' });
        await flushAuthAttach();
        expect(onChildAddedMock).not.toHaveBeenCalled();
        expect(getMock).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledTimes(1);
        unsub();
      } finally {
        vi.useRealTimers();
      }
    });

    it('attaches child listeners before get resolves', async () => {
      captureChildHandlers();
      let resolveGet: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      getMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          }),
      );

      subscribeSessionWordMaps('ABCDE', vi.fn());
      await flushAuthAttach();

      expect(onChildAddedMock).toHaveBeenCalled();
      expect(onChildChangedMock).toHaveBeenCalled();
      expect(onChildRemovedMock).toHaveBeenCalled();
      resolveGet({ exists: () => false, val: () => null });
    });

    it('seeds from get then merges child add/change/remove', async () => {
      const { getHandlers, unsubAdded, unsubChanged, unsubRemoved } = captureChildHandlers();
      getMock.mockResolvedValue({
        exists: () => true,
        val: () => ({ порт: { org: true } }),
      });

      const listener = vi.fn();
      const unsub = subscribeSessionWordMaps('ABCDE', listener, { localUid: 'org' });

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith({
          type: 'snapshot',
          seed: 'authoritative',
          maps: { wordPlayers: { порт: { org: true } } },
        });
      });

      expect(getMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('session_word_maps/ABCDE/wordPlayers'),
        }),
      );
      // Seed dump must not spam submitted-word actions.
      expect(devLogAction).not.toHaveBeenCalledWith(
        expect.stringMatching(/^submitted word/),
        expect.anything(),
      );

      const { added, changed, removed } = getHandlers();
      added?.({ key: 'ретро', val: () => ({ guest: true }) });
      expect(listener).toHaveBeenLastCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true }, ретро: { guest: true } } },
      });
      expect(devLogAction).toHaveBeenCalledWith('submitted word "ретро"', {
        observed: true,
        actor: 'guest',
        room: 'ABCDE',
        details: 'players=1',
      });

      changed?.({ key: 'порт', val: () => ({ org: true, guest: true }) });
      expect(listener).toHaveBeenLastCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: {
          wordPlayers: { порт: { org: true, guest: true }, ретро: { guest: true } },
        },
      });
      expect(devLogAction).toHaveBeenCalledWith('submitted word "порт"', {
        observed: true,
        actor: 'guest',
        room: 'ABCDE',
        details: 'players=2',
      });

      // Local uid claim after seed is skipped (submitOnlineWord already logged).
      changed?.({ key: 'ретро', val: () => ({ guest: true, org: true }) });
      expect(devLogAction).not.toHaveBeenCalledWith('submitted word "ретро"', {
        observed: true,
        actor: 'org',
        room: 'ABCDE',
        details: 'players=2',
      });

      removed?.({ key: 'порт', val: () => null });
      expect(listener).toHaveBeenLastCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { ретро: { guest: true, org: true } } },
      });

      unsub();
      expect(unsubAdded).toHaveBeenCalled();
      expect(unsubChanged).toHaveBeenCalled();
      expect(unsubRemoved).toHaveBeenCalled();
    });

    it('reconciles stale rich get with wipe buffered before seed finishes', async () => {
      const { getHandlers } = captureChildHandlers();
      let resolveGet: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      getMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          }),
      );

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();

      expect(onChildRemovedMock).toHaveBeenCalled();
      // Rematch wipe while get is in flight (would be lost if attach waited for get).
      getHandlers().removed?.({ key: 'порт', val: () => null });
      getHandlers().removed?.({ key: 'ретро', val: () => null });

      resolveGet({
        exists: () => true,
        val: () => ({
          порт: { org: true },
          ретро: { guest: true },
        }),
      });

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith({
          type: 'snapshot',
          seed: 'authoritative',
          maps: { wordPlayers: {} },
        });
      });
      expect(listener).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'snapshot',
          seed: 'authoritative',
          maps: expect.objectContaining({
            wordPlayers: expect.objectContaining({ порт: expect.anything() }),
          }),
        }),
      );
    });

    it('seeds empty maps when wordPlayers node is missing', async () => {
      captureChildHandlers();
      getMock.mockResolvedValue({ exists: () => false });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith({
          type: 'snapshot',
          seed: 'authoritative',
          maps: { wordPlayers: {} },
        });
      });
    });

    it('emits unavailable on seed get permission denied — never empty snapshot', async () => {
      captureChildHandlers();
      const denied = Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
      getMock.mockRejectedValue(denied);

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith({
          type: 'unavailable',
          reason: 'permission_denied',
        });
      });
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
      // Child listeners stay attached for live recovery (I1).
      expect(onChildAddedMock).toHaveBeenCalled();
    });

    it('PD with partial buffer never seals authoritative; no provisional after abandon (I1/I2)', async () => {
      vi.useFakeTimers();
      const { getHandlers } = captureChildHandlers();
      const denied = Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
      getMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(denied), 50);
          }),
      );

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();
      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });

      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'provisional',
        maps: { wordPlayers: { порт: { org: true } } },
      });

      listener.mockClear();
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'unavailable',
        reason: 'permission_denied',
      });
      expect(listener).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'snapshot', seed: 'authoritative' }),
      );

      listener.mockClear();
      getHandlers().added?.({ key: 'ретро', val: () => ({ guest: true }) });
      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).not.toHaveBeenCalled();
      expect(onChildAddedMock).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('after seed get failure keeps children provisional until retry get succeeds', async () => {
      vi.useFakeTimers();
      const { getHandlers } = captureChildHandlers();
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new Error('network'));
        }
        return Promise.resolve({
          exists: () => true,
          val: () => ({ порт: { org: true } }),
        });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await Promise.resolve();
      await Promise.resolve();
      // Retryable hard-fail does not emit unavailable (I2).
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });
      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'provisional',
        maps: { wordPlayers: { порт: { org: true } } },
      });

      listener.mockClear();
      await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(1));
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      vi.useRealTimers();
    });

    it('cancel tears down children once and ignores later child snapshots', async () => {
      const { getHandlers, unsubAdded, unsubChanged, unsubRemoved } = captureChildHandlers();
      getMock.mockResolvedValue({ exists: () => false });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await vi.waitFor(() => expect(listener).toHaveBeenCalled());

      listener.mockClear();
      const denied = Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
      getHandlers().cancel?.(denied);
      getHandlers().cancel?.(denied);
      getHandlers().cancel?.(denied);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        type: 'unavailable',
        reason: 'permission_denied',
      });
      expect(unsubAdded).toHaveBeenCalled();
      expect(unsubChanged).toHaveBeenCalled();
      expect(unsubRemoved).toHaveBeenCalled();

      listener.mockClear();
      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });
      getHandlers().changed?.({ key: 'порт', val: () => ({ org: true }) });
      getHandlers().removed?.({ key: 'порт', val: () => null });
      expect(listener).not.toHaveBeenCalled();
    });

    it('emits provisional snapshot from buffered children while get is pending', async () => {
      vi.useFakeTimers();
      const { getHandlers } = captureChildHandlers();
      let resolveGet: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      getMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          }),
      );

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();
      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });
      getHandlers().added?.({ key: 'ретро', val: () => ({ guest: true }) });

      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'provisional',
        maps: {
          wordPlayers: { порт: { org: true }, ретро: { guest: true } },
        },
      });

      resolveGet({
        exists: () => true,
        val: () => ({ порт: { org: true }, ретро: { guest: true } }),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenLastCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: {
          wordPlayers: { порт: { org: true }, ретро: { guest: true } },
        },
      });
      vi.useRealTimers();
    });

    it('seed get failure with buffered children retries get (does not seal partial seed)', async () => {
      vi.useFakeTimers();
      const { getHandlers } = captureChildHandlers();
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new Error('network'));
        }
        return Promise.resolve({
          exists: () => true,
          val: () => ({ порт: { org: true }, ретро: { guest: true } }),
        });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();
      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });

      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'provisional',
        maps: { wordPlayers: { порт: { org: true } } },
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      listener.mockClear();
      await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(1));
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: {
          wordPlayers: { порт: { org: true }, ретро: { guest: true } },
        },
      });
      expect(calls).toBe(2);
      vi.useRealTimers();
    });

    it('seed get soft timeout does not emit unavailable or parallel get; late empty seals', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let resolveFirst: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();

      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
      expect(calls).toBe(1);

      resolveFirst({ exists: () => false, val: () => null });
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: {} },
      });
      expect(calls).toBe(1);
      vi.useRealTimers();
    });

    it('empty room: hard get fail then retry empty finishes seed without child', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new Error('network'));
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await Promise.resolve();
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));

      listener.mockClear();
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_RETRY_MS);
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: {} },
      });
      expect(calls).toBe(2);
      vi.useRealTimers();
    });

    it('empty room: hung get soft-timeout stays single-flight until late empty seals', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let resolveFirst: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();

      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));
      expect(calls).toBe(1);

      resolveFirst({ exists: () => false, val: () => null });
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: {} },
      });
      expect(calls).toBe(1);
      vi.useRealTimers();
    });

    it('permission denied does not retry seed get or invent empty', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      const denied = Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
      getMock.mockRejectedValue(denied);

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'unavailable',
        reason: 'permission_denied',
      });
      expect(getMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_RETRY_MS * 5);
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
      vi.useRealTimers();
    });

    it('empty room: keeps retrying past several fails until empty get succeeds', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        if (calls <= SEED_RETRY_CONTINUES_PAST_ATTEMPTS) {
          return Promise.reject(new Error('network'));
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      for (let attempt = 1; attempt <= SEED_RETRY_CONTINUES_PAST_ATTEMPTS; attempt += 1) {
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toBe(attempt);
        expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
        listener.mockClear();
        await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(attempt));
      }

      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(SEED_RETRY_CONTINUES_PAST_ATTEMPTS + 1);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: {} },
      });
      vi.useRealTimers();
    });

    it('seed get timeout then child stays provisional; get before retry seals authoritative (lazy supersede)', async () => {
      vi.useFakeTimers();
      const { getHandlers } = captureChildHandlers();
      let resolveGet: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      getMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          }),
      );

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      listener.mockClear();
      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });
      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'provisional',
        maps: { wordPlayers: { порт: { org: true } } },
      });

      // Slow get settles after soft-timeout but before next startSeedGet — must seed (C1).
      listener.mockClear();
      resolveGet({
        exists: () => true,
        val: () => ({ порт: { org: true }, ретро: { guest: true } }),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: {
          wordPlayers: { порт: { org: true }, ретро: { guest: true } },
        },
      });
      vi.useRealTimers();
    });

    it('get resolves shortly after soft-timeout before retry starts → authoritative (C1)', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let resolveGet: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      getMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGet = resolve;
          }),
      );

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      listener.mockClear();

      await vi.advanceTimersByTimeAsync(50);
      resolveGet({
        exists: () => true,
        val: () => ({ порт: { org: true } }),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });

      // Retry timer must not start a second get after seed finished.
      const callsAfterSeed = getMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(1));
      expect(getMock).toHaveBeenCalledTimes(callsAfterSeed);
      vi.useRealTimers();
    });

    it('soft timeout stays single-flight; late settle merges buffer without parallel get', async () => {
      vi.useFakeTimers();
      const { getHandlers } = captureChildHandlers();
      let resolveFirst: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();
      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });

      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'provisional',
        maps: { wordPlayers: { порт: { org: true } } },
      });

      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(calls).toBe(1);
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      resolveFirst({
        exists: () => true,
        val: () => ({ ретро: { guest: true } }),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(1);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: {
          wordPlayers: { порт: { org: true }, ретро: { guest: true } },
        },
      });
      vi.useRealTimers();
    });

    it('soft timeout single-flight: late settle of same get still seals authoritative', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let resolveFirst: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);
      await flushAuthAttach();

      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      expect(calls).toBe(1);
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      resolveFirst({
        exists: () => true,
        val: () => ({ ретро: { guest: true } }),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { ретро: { guest: true } } },
      });
      expect(calls).toBe(1);
      vi.useRealTimers();
    });

    it('never runs more than one seed get in flight (single-flight I2)', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let inFlight = 0;
      let maxInFlight = 0;
      getMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            setTimeout(() => {
              inFlight -= 1;
              resolve({ exists: () => false, val: () => null });
            }, WORD_MAPS_SEED_GET_TIMEOUT_MS + 50);
          }),
      );

      subscribeSessionWordMaps('ABCDE', vi.fn(), { seedGetMaxAttempts: 3 });
      await flushAuthAttach();
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(maxInFlight).toBe(1);
      vi.useRealTimers();
    });

    it('soft-timeout does not burn seedAttempt; reject after soft still starts more gets (I1)', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let rejectFirst: (error: Error) => void = () => undefined;
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return new Promise((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener, { seedGetMaxAttempts: 3 });
      await flushAuthAttach();
      expect(calls).toBe(1);

      // Several soft-timeouts must not exhaust the 3-get budget.
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(calls).toBe(1);
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      rejectFirst(new Error('network'));
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(1));
      await Promise.resolve();
      await Promise.resolve();

      expect(calls).toBe(2);
      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: {} },
      });
      vi.useRealTimers();
    });

    it('forever-hung get#1: get call count stays 1 until soft-tick abandon (I1-R1)', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let resolveHung: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        return new Promise((resolve) => {
          resolveHung = resolve;
        });
      });

      const listener = vi.fn();
      // Dual budget N=3: soft ticks + max real gets — hung path still only 1 get.
      subscribeSessionWordMaps('ABCDE', listener, { seedGetMaxAttempts: 3 });
      await flushAuthAttach();
      expect(calls).toBe(1);

      // softTimeoutTicks 1..2: still waiting (seedAttempt stays 1; no parallel get).
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(calls).toBe(1);
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      // softTimeoutTicks 3 (= maxSoftTicksPerGet) → abandon; still exactly one get.
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'unavailable',
        reason: 'error',
      });
      expect(calls).toBe(1);

      listener.mockClear();
      resolveHung({ exists: () => false, val: () => null });
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
      // No get#2 after abandon of hung get#1.
      expect(calls).toBe(1);
      vi.useRealTimers();
    });

    it('last real get soft-tick must not abandon before soft-tick cap (late seal)', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      let resolveThird: (value: { exists: () => boolean; val: () => unknown }) => void = () =>
        undefined;
      let calls = 0;
      getMock.mockImplementation(() => {
        calls += 1;
        if (calls <= 2) {
          return Promise.reject(new Error('network'));
        }
        return new Promise((resolve) => {
          resolveThird = resolve;
        });
      });

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener, { seedGetMaxAttempts: 3 });
      await flushAuthAttach();
      expect(calls).toBe(1);

      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(1));
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(2);

      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(2));
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(3);

      // One soft tick on get#3 must NOT abandon (dual budget = N soft ticks per hung get).
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_TIMEOUT_MS);
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));

      resolveThird({
        exists: () => true,
        val: () => ({ порт: { org: true } }),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(listener).toHaveBeenCalledWith({
        type: 'snapshot',
        seed: 'authoritative',
        maps: { wordPlayers: { порт: { org: true } } },
      });
      expect(calls).toBe(3);
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'unavailable' }));
      vi.useRealTimers();
    });

    it('coalesces repeated child ops for the same key (O(words) buffer)', () => {
      const ops = coalesceWordPlayersChildBuffer([
        { kind: 'upsert', key: 'порт', val: { org: true } },
        { kind: 'upsert', key: 'порт', val: { org: true, guest: true } },
        { kind: 'remove', key: 'порт' },
        { kind: 'upsert', key: 'порт', val: { org: true } },
        { kind: 'upsert', key: 'ретро', val: { guest: true } },
      ]);
      expect(ops).toHaveLength(2);
      expect(ops).toEqual([
        { kind: 'upsert', key: 'порт', val: { org: true } },
        { kind: 'upsert', key: 'ретро', val: { guest: true } },
      ]);
    });

    it('stops seed retry after max attempts and emits unavailable once', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      getMock.mockRejectedValue(new Error('network'));

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      for (let attempt = 1; attempt <= WORD_MAPS_SEED_GET_MAX_ATTEMPTS; attempt += 1) {
        await Promise.resolve();
        await Promise.resolve();
        expect(getMock).toHaveBeenCalledTimes(attempt);
        if (attempt < WORD_MAPS_SEED_GET_MAX_ATTEMPTS) {
          expect(listener).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'unavailable' }),
          );
          await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(attempt));
        }
      }

      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'unavailable',
        reason: 'error',
      });
      expect(listener.mock.calls.filter((c) => c[0]?.type === 'unavailable')).toHaveLength(1);

      listener.mockClear();
      const callsAtStop = getMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(WORD_MAPS_SEED_GET_RETRY_MS * 20);
      expect(getMock).toHaveBeenCalledTimes(callsAtStop);
      expect(listener).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('honors seedGetMaxAttempts override (results roster shorter budget)', async () => {
      vi.useFakeTimers();
      captureChildHandlers();
      getMock.mockRejectedValue(new Error('network'));

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener, { seedGetMaxAttempts: 2 });

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await Promise.resolve();
        await Promise.resolve();
        expect(getMock).toHaveBeenCalledTimes(attempt);
        if (attempt < 2) {
          await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(attempt));
        }
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({
        type: 'unavailable',
        reason: 'error',
      });
      expect(getMock).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('after seed abandon does not emit further provisional from children', async () => {
      vi.useFakeTimers();
      const { getHandlers } = captureChildHandlers();
      getMock.mockRejectedValue(new Error('network'));

      const listener = vi.fn();
      subscribeSessionWordMaps('ABCDE', listener);

      for (let attempt = 1; attempt <= WORD_MAPS_SEED_GET_MAX_ATTEMPTS; attempt += 1) {
        await Promise.resolve();
        await Promise.resolve();
        if (attempt < WORD_MAPS_SEED_GET_MAX_ATTEMPTS) {
          await vi.advanceTimersByTimeAsync(wordMapsSeedRetryDelayMs(attempt));
        }
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(listener).toHaveBeenCalledWith({ type: 'unavailable', reason: 'error' });

      listener.mockClear();
      getHandlers().added?.({ key: 'порт', val: () => ({ org: true }) });
      await vi.advanceTimersByTimeAsync(WORD_MAPS_PROVISIONAL_SEED_MS);
      expect(listener).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
