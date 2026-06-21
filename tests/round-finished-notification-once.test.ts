import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
const notifyRoundFinished = vi.fn();

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

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string) => key,
  },
}));

vi.mock('../lib/online/round-finished-notification.js', () => ({
  notifyRoundFinished: (...args: unknown[]) => notifyRoundFinished(...args),
}));

import {
  isRoundFinishedNotified,
  notifyRoundFinishedOnce,
} from '../lib/online/round-finished-notification-once';

describe('round-finished-notification-once', () => {
  beforeEach(() => {
    storage.clear();
    notifyRoundFinished.mockReset();
    notifyRoundFinished.mockResolvedValue(true);
  });

  it('sends once per device per round and records the key only after success', async () => {
    expect(await notifyRoundFinishedOnce('ab12', 0, 'тест')).toBe(true);
    expect(await notifyRoundFinishedOnce('ab12', 0, 'тест')).toBe(false);
    expect(notifyRoundFinished).toHaveBeenCalledTimes(1);
    expect(await isRoundFinishedNotified('ab12', 0)).toBe(true);
  });

  it('does not record the key when notification delivery fails', async () => {
    notifyRoundFinished.mockResolvedValue(false);

    expect(await notifyRoundFinishedOnce('ab12', 1, 'тест')).toBe(false);
    expect(await isRoundFinishedNotified('ab12', 1)).toBe(false);
    expect(await notifyRoundFinishedOnce('ab12', 1, 'тест')).toBe(false);
    expect(notifyRoundFinished).toHaveBeenCalledTimes(2);
  });
});
