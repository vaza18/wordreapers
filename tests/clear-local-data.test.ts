import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storage, signOutFirebaseAuth } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const signOutFirebaseAuth = vi.fn(async () => {
    for (const key of [...storage.keys()]) {
      if (key.startsWith('firebase:authUser:')) {
        storage.delete(key);
      }
    }
  });
  return { storage, signOutFirebaseAuth };
});

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
    getAllKeys: () => Promise.resolve([...storage.keys()]),
    multiRemove: (keys: string[]) => {
      for (const key of keys) {
        storage.delete(key);
      }
      return Promise.resolve();
    },
  },
}));

vi.mock('../lib/firebase/auth', () => ({
  signOutFirebaseAuth,
}));

import { clearLocalDataStorage } from '../lib/settings/clear-local-data';
import { PROFILE_STORAGE_KEY } from '../lib/profile/player-profile';

describe('clearLocalDataStorage', () => {
  beforeEach(() => {
    storage.clear();
    signOutFirebaseAuth.mockClear();
  });

  it('removes all wordreapers.* keys and signs out Firebase Auth', async () => {
    storage.set(PROFILE_STORAGE_KEY, '{"name":"Test"}');
    storage.set('wordreapers.finishedOnlineRounds', '{"ab12:0":{}}');
    storage.set('wordreapers.pendingFinishedArchives', '{}');
    storage.set('wordreapers.activeOnlineRounds', '{}');
    storage.set('wordreapers.processedOnlineRounds', '[]');
    storage.set('wordreapers.roundFinishedNotified', '{}');
    storage.set('wordreapers.gameSetup', '{}');
    storage.set('wordreapers.appearanceMode', 'dark');
    storage.set('firebase:authUser:demo:[DEFAULT]', '{"uid":"abc"}');

    await clearLocalDataStorage();

    expect(signOutFirebaseAuth).toHaveBeenCalledOnce();
    expect([...storage.keys()]).toEqual([]);
  });

  it('signs out Firebase Auth even when no wordreapers keys exist', async () => {
    storage.set('firebase:authUser:demo:[DEFAULT]', '{"uid":"abc"}');

    await clearLocalDataStorage();

    expect(signOutFirebaseAuth).toHaveBeenCalledOnce();
    expect([...storage.keys()]).toEqual([]);
  });

  it('clears future wordreapers keys without an explicit allowlist', async () => {
    storage.set('wordreapers.futureFeature', 'value');

    await clearLocalDataStorage();

    expect(storage.has('wordreapers.futureFeature')).toBe(false);
    expect(signOutFirebaseAuth).toHaveBeenCalledOnce();
  });
});
