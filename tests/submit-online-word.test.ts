import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const runTransactionMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org-1' }),
}));

vi.mock('../lib/online/word-maps-shard-refs.js', () => ({
  wordPlayersShardPlayerRef: (gameId: string, normalized: string, uid: string) => ({
    path: `session_word_maps/${gameId}/wordPlayers/${normalized}/${uid}`,
  }),
  wordPlayersPerWordRef: (gameId: string, normalized: string) => ({
    path: `session_word_maps/${gameId}/wordPlayers/${normalized}`,
  }),
}));

import { submitOnlineWord } from '../lib/firebase/submit-online-word.js';

function isWordPlayersParentPath(path: string): boolean {
  return /session_word_maps\/[^/]+\/wordPlayers\/[^/]+$/.test(path);
}

function isWordPlayersLeafPath(path: string): boolean {
  return /session_word_maps\/[^/]+\/wordPlayers\/[^/]+\/[^/]+$/.test(path);
}

describe('submitOnlineWord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists a unique word via parent shard tx only (no session score / x2Claim)', async () => {
    runTransactionMock.mockImplementation(
      async (ref: { path: string }, updater: (v: unknown) => unknown) => {
        if (isWordPlayersParentPath(ref.path)) {
          const next = updater(null);
          return { committed: true, snapshot: { val: () => next } };
        }
        return { committed: false, snapshot: { val: () => null } };
      },
    );

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(result).toEqual({
      ok: true,
      entry: expect.objectContaining({ normalized: 'порт', kind: 'unique', points: 2 }),
    });
    expect(runTransactionMock).toHaveBeenCalledTimes(1);
    expect(runTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'session_word_maps/ABCDE/wordPlayers/порт',
      }),
      expect.any(Function),
    );
    expect(getMock).not.toHaveBeenCalled();
  });

  it('persists a shared word via leaf shard and returns normal entry', async () => {
    runTransactionMock.mockImplementation(
      async (ref: { path: string }, updater: (v: unknown) => unknown) => {
        if (isWordPlayersParentPath(ref.path)) {
          // Peer already created the word node.
          const next = updater({ peer: true });
          expect(next).toBeUndefined();
          return { committed: false, snapshot: { val: () => ({ peer: true }) } };
        }
        if (isWordPlayersLeafPath(ref.path)) {
          const next = updater(null);
          return { committed: true, snapshot: { val: () => next } };
        }
        return { committed: false, snapshot: { val: () => null } };
      },
    );
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ peer: true, 'org-1': true }),
    });

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(result).toEqual({
      ok: true,
      entry: expect.objectContaining({ normalized: 'порт', kind: 'normal', points: 1 }),
    });
    expect(getMock).toHaveBeenCalled();
  });

  it('returns DUPLICATE when leaf already owned', async () => {
    runTransactionMock.mockImplementation(
      async (ref: { path: string }, updater: (v: unknown) => unknown) => {
        if (isWordPlayersParentPath(ref.path)) {
          updater({ peer: true });
          return { committed: false, snapshot: { val: () => ({ peer: true }) } };
        }
        if (isWordPlayersLeafPath(ref.path)) {
          updater(true);
          return { committed: false, snapshot: { val: () => true } };
        }
        return { committed: false, snapshot: { val: () => null } };
      },
    );

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'DUPLICATE' });
  });

  it('treats leaf commit as success when parent get throws (unique until maps confirm)', async () => {
    runTransactionMock.mockImplementation(
      async (ref: { path: string }, updater: (v: unknown) => unknown) => {
        if (isWordPlayersParentPath(ref.path)) {
          updater({ peer: true });
          return { committed: false, snapshot: { val: () => ({ peer: true }) } };
        }
        if (isWordPlayersLeafPath(ref.path)) {
          const next = updater(null);
          return { committed: true, snapshot: { val: () => next } };
        }
        return { committed: false, snapshot: { val: () => null } };
      },
    );
    getMock.mockRejectedValue(new Error('network'));

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(result).toEqual({
      ok: true,
      entry: expect.objectContaining({ normalized: 'порт', kind: 'unique', points: 2 }),
    });
  });

  it('two uids claim the same word via stateful parent then leaf without wiping peer', async () => {
    const store: Record<string, unknown> = {};

    runTransactionMock.mockImplementation(
      async (ref: { path: string }, updater: (v: unknown) => unknown) => {
        const path = ref.path;
        if (isWordPlayersParentPath(path)) {
          const current = store[path] ?? null;
          const next = updater(current);
          if (next === undefined) {
            return { committed: false, snapshot: { val: () => store[path] ?? current } };
          }
          store[path] = next;
          return { committed: true, snapshot: { val: () => next } };
        }
        if (isWordPlayersLeafPath(path)) {
          const current = store[path] ?? null;
          const next = updater(current);
          if (next === undefined) {
            return { committed: false, snapshot: { val: () => store[path] ?? current } };
          }
          store[path] = next;
          const parentPath = path.replace(/\/[^/]+$/, '');
          const parent = { ...((store[parentPath] as Record<string, boolean>) ?? {}) };
          const uid = path.split('/').pop()!;
          parent[uid] = true;
          store[parentPath] = parent;
          return { committed: true, snapshot: { val: () => next } };
        }
        return { committed: false, snapshot: { val: () => null } };
      },
    );
    getMock.mockImplementation(async (ref: { path: string }) => ({
      val: () => store[ref.path] ?? null,
    }));

    const first = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);
    const second = await submitOnlineWord('ABCDE', 'peer-2', 'порт', true);
    const dup = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(first).toEqual({
      ok: true,
      entry: expect.objectContaining({ kind: 'unique', points: 2 }),
    });
    expect(second).toEqual({
      ok: true,
      entry: expect.objectContaining({ kind: 'normal', points: 1 }),
    });
    expect(dup).toEqual({ ok: false, error: 'DUPLICATE' });
    expect(store['session_word_maps/ABCDE/wordPlayers/порт']).toEqual({
      'org-1': true,
      'peer-2': true,
    });
  });
});
