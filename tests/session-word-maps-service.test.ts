import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
const onValueMock = vi.fn();
const ensureAnonymousAuth = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  onValue: (...args: unknown[]) => onValueMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuth(),
}));

import {
  clearSessionWordMaps,
  fetchSessionWordMaps,
  subscribeSessionWordMaps,
  writeSessionWordMapsShards,
} from '../lib/firebase/session-word-maps-service.js';

describe('session-word-maps-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAnonymousAuth.mockResolvedValue({ uid: 'u1' });
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
  });

  it('returns empty maps when the shard root is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(fetchSessionWordMaps('abcd')).resolves.toEqual({
      wordFirst: {},
      wordPlayers: {},
    });
  });

  it('writes per-word shards instead of bulk root updates', async () => {
    await writeSessionWordMapsShards('ABCD', {
      wordFirst: { порт: 'org-1' },
      wordPlayers: { порт: { 'org-1': true, guest: false } },
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('session_word_maps/ABCD') }),
      {
        'wordFirst/порт': 'org-1',
        'wordPlayers/порт/org-1': true,
      },
    );
  });

  it('ignores permission denied when clearing word maps', async () => {
    const denied = new Error('Permission denied') as Error & { code: string };
    denied.code = 'PERMISSION_DENIED';
    removeMock.mockRejectedValueOnce(denied);

    await expect(clearSessionWordMaps('ABCD')).resolves.toBeUndefined();
  });

  it('subscribes to live word maps and emits parsed values', () => {
    let valueListener:
      | ((snapshot: { exists: () => boolean; val: () => unknown }) => void)
      | undefined;
    onValueMock.mockImplementation((_ref, onNext) => {
      valueListener = onNext as typeof valueListener;
      return vi.fn();
    });

    const listener = vi.fn();
    subscribeSessionWordMaps('ABCD', listener);

    valueListener?.({
      exists: () => true,
      val: () => ({
        wordFirst: { порт: 'org-1' },
        wordPlayers: { порт: { 'org-1': true } },
      }),
    });

    expect(listener).toHaveBeenCalledWith({
      wordFirst: { порт: 'org-1' },
      wordPlayers: { порт: { 'org-1': true } },
    });
  });

  it('returns empty maps on permission denied subscription errors', () => {
    let errorListener: ((error: Error & { code: string }) => void) | undefined;
    onValueMock.mockImplementation((_ref, _onNext, onError) => {
      errorListener = onError as typeof errorListener;
      return vi.fn();
    });

    const listener = vi.fn();
    subscribeSessionWordMaps('ABCD', listener);
    errorListener?.(Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }));

    expect(listener).toHaveBeenCalledWith({
      wordFirst: {},
      wordPlayers: {},
    });
  });
});
