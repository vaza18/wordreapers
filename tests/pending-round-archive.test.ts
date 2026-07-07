import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      storage.delete(key);
      return Promise.resolve();
    },
  },
}));

import {
  clearPendingRoundArchive,
  listPendingRoundArchives,
  markPendingRoundArchive,
} from '../lib/online/session/pending-round-archive';

describe('pending-round-archive', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('marks and clears a pending archive', async () => {
    await markPendingRoundArchive('ab12', 0, 'uid-a');
    expect(await listPendingRoundArchives()).toHaveLength(1);

    await clearPendingRoundArchive('ab12', 0);
    expect(await listPendingRoundArchives()).toHaveLength(0);
  });
});
