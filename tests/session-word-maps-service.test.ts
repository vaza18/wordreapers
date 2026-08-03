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
  ensureSessionWordMapsEmptyForRoundStart,
  requireSessionWordMaps,
  subscribeSessionWordMaps,
  tryFetchSessionWordMaps,
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
  });

  it('ignores permission denied when clearing word maps', async () => {
    const denied = new Error('Permission denied') as Error & { code: string };
    denied.code = 'PERMISSION_DENIED';
    removeMock.mockRejectedValueOnce(denied);

    await expect(clearSessionWordMaps('ABCDE')).resolves.toBeUndefined();
  });

  it('ensureSessionWordMapsEmptyForRoundStart verifies empty after clear', async () => {
    getMock.mockResolvedValue({ exists: () => false });
    await expect(ensureSessionWordMapsEmptyForRoundStart('ABCDE')).resolves.toBeUndefined();
    expect(removeMock).toHaveBeenCalled();
  });

  it('ensureSessionWordMapsEmptyForRoundStart fails when maps stay rich', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ wordPlayers: { порт: { org: true } } }),
    });
    await expect(ensureSessionWordMapsEmptyForRoundStart('ABCDE')).rejects.toThrow(
      'SESSION_WORD_MAPS_NOT_CLEARED',
    );
  });

  it('subscribes to live word maps and emits parsed values', () => {
    let valueListener:
      ((snapshot: { exists: () => boolean; val: () => unknown }) => void) | undefined;
    onValueMock.mockImplementation((_ref, onNext) => {
      valueListener = onNext as typeof valueListener;
      return vi.fn();
    });

    const listener = vi.fn();
    subscribeSessionWordMaps('ABCDE', listener);

    valueListener?.({
      exists: () => true,
      val: () => ({ wordPlayers: { порт: { org: true } } }),
    });

    expect(listener).toHaveBeenCalledWith({
      type: 'snapshot',
      maps: { wordPlayers: { порт: { org: true } } },
    });
  });
});
