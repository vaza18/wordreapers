import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const removeMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

import { rollbackWordMapsShard } from '../lib/online/word-maps-shard-rollback.js';

describe('rollbackWordMapsShard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeMock.mockResolvedValue(undefined);
  });

  it('removes player shard and wordFirst when no players remain on the word', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await rollbackWordMapsShard('ABCD', 'порт', 'org-1');

    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'session_word_maps/ABCD/wordPlayers/порт/org-1',
      }),
    );
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'session_word_maps/ABCD/wordFirst/порт',
      }),
    );
  });

  it('keeps wordFirst when other players still have the word', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ guest: true }),
    });

    await rollbackWordMapsShard('ABCD', 'порт', 'org-1');

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'session_word_maps/ABCD/wordPlayers/порт/org-1',
      }),
    );
  });

  it('removes wordFirst when the parent shard is empty', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({}),
    });

    await rollbackWordMapsShard('abcd', 'порт', 'org-1');

    expect(removeMock).toHaveBeenCalledTimes(2);
  });

  it('swallows firebase errors during best-effort cleanup', async () => {
    removeMock.mockRejectedValueOnce(new Error('network'));
    getMock.mockRejectedValueOnce(new Error('network'));

    await expect(rollbackWordMapsShard('ABCD', 'порт', 'org-1')).resolves.toBeUndefined();
  });
});
