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

import {
  rollbackWordMapsShard,
  rollbackWordSubmitArtifacts,
} from '../lib/online/word-maps-shard-rollback.js';

describe('rollbackWordMapsShard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeMock.mockResolvedValue(undefined);
  });

  it('removes player wordPlayers shard', async () => {
    await rollbackWordMapsShard('ABCDE', 'порт', 'org-1');

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'session_word_maps/ABCDE/wordPlayers/порт/org-1',
      }),
    );
    expect(getMock).not.toHaveBeenCalled();
  });

  it('swallows firebase errors during best-effort cleanup', async () => {
    removeMock.mockRejectedValueOnce(new Error('network'));

    await expect(rollbackWordMapsShard('ABCDE', 'порт', 'org-1')).resolves.toBeUndefined();
  });
});

describe('rollbackWordSubmitArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeMock.mockResolvedValue(undefined);
  });

  it('removes wordPlayers shard and player_words leaf', async () => {
    await rollbackWordSubmitArtifacts('ABCDE', 'порт', 'org-1');

    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'session_word_maps/ABCDE/wordPlayers/порт/org-1',
      }),
    );
    expect(removeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'player_words/ABCDE/org-1/порт',
      }),
    );
  });
});
