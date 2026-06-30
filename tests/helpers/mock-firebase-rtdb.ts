import { vi } from 'vitest';

const rtdbState = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  onValue: vi.fn(),
  onDisconnect: vi.fn(() => ({
    set: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  })),
}));

/** Shared RTDB mock handles for assertions in tests. */
export function getFirebaseRtdbMocks() {
  return rtdbState;
}

/** Vitest factory for `firebase/database`. */
export function firebaseDatabaseMockFactory() {
  const m = rtdbState;
  return {
    endAt: (...args: unknown[]) => ({ type: 'endAt', args }),
    get: (...args: unknown[]) => m.get(...args),
    limitToFirst: (n: number) => ({ type: 'limitToFirst', n }),
    limitToLast: (n: number) => ({ type: 'limitToLast', n }),
    onDisconnect: () => m.onDisconnect(),
    onValue: (...args: unknown[]) => m.onValue(...args),
    orderByChild: (key: string) => ({ type: 'orderByChild', key }),
    query: (...args: unknown[]) => ({ type: 'query', args }),
    ref: (_db: unknown, path: string) => ({ path }),
    remove: (...args: unknown[]) => m.remove(...args),
    set: (...args: unknown[]) => m.set(...args),
    startAt: (...args: unknown[]) => ({ type: 'startAt', args }),
    update: (...args: unknown[]) => m.update(...args),
  };
}

/** Vitest factory for `../lib/firebase/init.js` from files under `tests/`. */
export function firebaseInitMockFactory() {
  return {
    getFirebaseDatabase: () => ({}),
  };
}

export function rtdbSnapshot<T>(value: T, exists = true) {
  return {
    exists: () => exists,
    val: () => value,
  };
}

export function resetFirebaseRtdbMocks(): void {
  rtdbState.get.mockReset();
  rtdbState.set.mockReset();
  rtdbState.update.mockReset();
  rtdbState.remove.mockReset();
  rtdbState.onValue.mockReset();
  rtdbState.onDisconnect.mockReset();
}
