import { vi } from 'vitest';

const asyncStorageState = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const api = {
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
  };
  return { storage, api };
});

/** Vitest factory for `@react-native-async-storage/async-storage`. */
export function asyncStorageMockFactory() {
  return { default: asyncStorageState.api };
}

export function resetAsyncStorageMock(): void {
  asyncStorageState.storage.clear();
}

export function getAsyncStorageMap(): Map<string, string> {
  return asyncStorageState.storage;
}
