import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org-1' }),
}));

const devLogAction = vi.fn();
vi.mock('../lib/debug/dev-log.js', () => ({
  devLogAction: (...args: unknown[]) => devLogAction(...args),
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

function permissionDenied(): Error {
  const error = new Error('PERMISSION_DENIED');
  (error as Error & { code: string }).code = 'PERMISSION_DENIED';
  return error;
}

describe('submitOnlineWord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists a unique word via parent set only (no session score / x2Claim / transaction)', async () => {
    setMock.mockResolvedValue(undefined);

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(result).toEqual({
      ok: true,
      entry: expect.objectContaining({ normalized: 'порт', kind: 'unique', points: 2 }),
    });
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'session_word_maps/ABCDE/wordPlayers/порт',
      }),
      { 'org-1': true },
    );
    expect(getMock).not.toHaveBeenCalled();
    expect(devLogAction).toHaveBeenCalledWith('submitted word "порт"', {
      room: 'ABCDE',
      details: 'kind=unique players=1',
    });
  });

  it('persists a shared word via leaf set after parent denied', async () => {
    setMock.mockImplementation(async (ref: { path: string }, value: unknown) => {
      if (isWordPlayersParentPath(ref.path)) {
        throw permissionDenied();
      }
      if (isWordPlayersLeafPath(ref.path)) {
        expect(value).toBe(true);
        return;
      }
      throw new Error(`unexpected set ${ref.path}`);
    });
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ peer: true, 'org-1': true }),
    });

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(result).toEqual({
      ok: true,
      entry: expect.objectContaining({ normalized: 'порт', kind: 'normal', points: 1 }),
    });
    expect(setMock).toHaveBeenCalledTimes(2);
    expect(getMock).toHaveBeenCalled();
    expect(devLogAction).toHaveBeenCalledWith('submitted word "порт"', {
      room: 'ABCDE',
      details: 'kind=normal players=2',
    });
  });

  it('returns NOT_PLAYING when parent and leaf sets are denied', async () => {
    setMock.mockRejectedValue(permissionDenied());

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'NOT_PLAYING' });
    expect(devLogAction).not.toHaveBeenCalled();
  });

  it('treats leaf commit as success when parent get throws (unique until maps confirm)', async () => {
    setMock.mockImplementation(async (ref: { path: string }) => {
      if (isWordPlayersParentPath(ref.path)) {
        throw permissionDenied();
      }
    });
    getMock.mockRejectedValue(new Error('network'));

    const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(result).toEqual({
      ok: true,
      entry: expect.objectContaining({ normalized: 'порт', kind: 'unique', points: 2 }),
    });
  });

  it('two uids claim the same word via parent then leaf set without wiping peer', async () => {
    const store: Record<string, unknown> = {};

    setMock.mockImplementation(async (ref: { path: string }, value: unknown) => {
      const path = ref.path;
      if (isWordPlayersParentPath(path)) {
        if (store[path] != null) {
          throw permissionDenied();
        }
        store[path] = value;
        return;
      }
      if (isWordPlayersLeafPath(path)) {
        store[path] = value;
        const parentPath = path.replace(/\/[^/]+$/, '');
        const parent = { ...((store[parentPath] as Record<string, boolean>) ?? {}) };
        const uid = path.split('/').pop()!;
        parent[uid] = true;
        store[parentPath] = parent;
        return;
      }
      throw new Error(`unexpected set ${path}`);
    });
    getMock.mockImplementation(async (ref: { path: string }) => ({
      val: () => store[ref.path] ?? null,
    }));

    const first = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);
    const second = await submitOnlineWord('ABCDE', 'peer-2', 'порт', true);
    const again = await submitOnlineWord('ABCDE', 'org-1', 'порт', true);

    expect(first).toEqual({
      ok: true,
      entry: expect.objectContaining({ kind: 'unique', points: 2 }),
    });
    expect(second).toEqual({
      ok: true,
      entry: expect.objectContaining({ kind: 'normal', points: 1 }),
    });
    // Idempotent leaf set — already claimed locally still reports ok (play dedupes first).
    expect(again).toEqual({
      ok: true,
      entry: expect.objectContaining({ kind: 'normal', points: 1 }),
    });
    expect(store['session_word_maps/ABCDE/wordPlayers/порт']).toEqual({
      'org-1': true,
      'peer-2': true,
    });
  });
});
