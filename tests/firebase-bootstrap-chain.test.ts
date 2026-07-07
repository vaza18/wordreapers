import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onValueMock = vi.fn();
const ensureAnonymousAuth = vi.fn();
const ensureFirebaseAppCheck = vi.fn();
const isFirebaseConfigured = vi.fn();
const hasNativeFirebaseAppModule = vi.fn();
const getFirebaseApp = vi.fn();

vi.mock('firebase/database', () => ({
  onValue: (...args: unknown[]) => onValueMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
  getFirebaseApp: () => getFirebaseApp(),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuth(),
}));

vi.mock('../lib/firebase/app-check.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firebase/app-check.js')>();
  return {
    ...actual,
    ensureFirebaseAppCheck: () => ensureFirebaseAppCheck(),
  };
});

vi.mock('../lib/firebase/config.js', () => ({
  isFirebaseConfigured: () => isFirebaseConfigured(),
}));

vi.mock('../lib/firebase/has-native-firebase-app-module.js', () => ({
  hasNativeFirebaseAppModule: () => hasNativeFirebaseAppModule(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import { bootstrapFirebase, resetFirebaseBootstrap } from '../lib/firebase/bootstrap.js';
import { ensureFirebaseReady } from '../lib/firebase/ensure-firebase-ready.js';
import { bootstrapFirebaseConnection, waitForRtdbConnected } from '../lib/firebase/connection.js';
import { ensureFirebaseAppCheck as ensureFirebaseAppCheckDirect } from '../lib/firebase/app-check.js';

describe('firebase bootstrap chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetFirebaseBootstrap();
    isFirebaseConfigured.mockReturnValue(true);
    ensureAnonymousAuth.mockResolvedValue({ uid: 'anon-1' });
    ensureFirebaseAppCheck.mockResolvedValue(undefined);
    getFirebaseApp.mockReturnValue({});
    hasNativeFirebaseAppModule.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetFirebaseBootstrap();
  });

  it('waits until RTDB reports connected', async () => {
    onValueMock.mockImplementation((_ref, onNext) => {
      const unsub = vi.fn();
      setTimeout(() => onNext({ val: () => true }), 0);
      return unsub;
    });

    const pending = waitForRtdbConnected(100);
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when RTDB connection times out', async () => {
    onValueMock.mockImplementation(() => vi.fn());

    const pending = waitForRtdbConnected(50);
    const expectation = expect(pending).rejects.toThrow('RTDB connection timed out');
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
  });

  it('bootstraps auth, app check, RTDB, and server clock', async () => {
    onValueMock.mockImplementation((ref, onNext) => {
      const unsub = vi.fn();
      if ((ref as { path: string }).path === '.info/connected') {
        setTimeout(() => onNext({ val: () => true }), 0);
      }
      return unsub;
    });

    const pending = bootstrapFirebaseConnection();
    await vi.advanceTimersByTimeAsync(0);
    const result = await pending;

    expect(result).toEqual({ status: 'ok', uid: 'anon-1' });
    expect(ensureFirebaseAppCheck).toHaveBeenCalled();
    expect(ensureAnonymousAuth).toHaveBeenCalled();
  });

  it('returns error result when bootstrap fails', async () => {
    ensureAnonymousAuth.mockRejectedValue(new Error('AUTH_FAILED'));

    const result = await bootstrapFirebaseConnection();

    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('AUTH_FAILED');
  });

  it('resets cached bootstrap promise', async () => {
    onValueMock.mockImplementation((_ref, onNext) => {
      const unsub = vi.fn();
      setTimeout(() => onNext({ val: () => true }), 0);
      return unsub;
    });

    const pending = bootstrapFirebase();
    resetFirebaseBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    const second = bootstrapFirebase();
    await vi.advanceTimersByTimeAsync(0);
    await second;

    expect(ensureAnonymousAuth).toHaveBeenCalledTimes(2);
  });

  it('caches bootstrap promise until reset', async () => {
    onValueMock.mockImplementation((_ref, onNext) => {
      const unsub = vi.fn();
      setTimeout(() => onNext({ val: () => true }), 0);
      return unsub;
    });

    const first = bootstrapFirebase();
    const second = bootstrapFirebase();

    expect(first).toBe(second);
    await vi.advanceTimersByTimeAsync(0);
    await first;
    expect(ensureAnonymousAuth).toHaveBeenCalledTimes(1);
  });

  it('returns not_configured when firebase env is missing', async () => {
    isFirebaseConfigured.mockReturnValue(false);

    await expect(bootstrapFirebase()).resolves.toEqual({
      status: 'not_configured',
      errorMessage: 'Missing EXPO_PUBLIC_FIREBASE_* in .env',
    });
  });

  it('rejects when RTDB listener reports an error', async () => {
    onValueMock.mockImplementation((_ref, _onNext, onError) => {
      const unsub = vi.fn();
      setTimeout(() => onError(new Error('RTDB_DOWN')), 0);
      return unsub;
    });

    const pending = waitForRtdbConnected(100);
    const expectation = expect(pending).rejects.toThrow('RTDB_DOWN');
    await vi.advanceTimersByTimeAsync(0);
    await expectation;
  });

  it('returns not_configured from ensureFirebaseReady when env is missing', async () => {
    isFirebaseConfigured.mockReturnValue(false);

    await expect(ensureFirebaseReady()).resolves.toEqual({
      status: 'not_configured',
      errorMessage: 'Missing EXPO_PUBLIC_FIREBASE_* in .env',
    });
  });

  it('forceRetry clears cached bootstrap', async () => {
    onValueMock.mockImplementation((_ref, onNext) => {
      const unsub = vi.fn();
      setTimeout(() => onNext({ val: () => true }), 0);
      return unsub;
    });

    const first = ensureFirebaseReady();
    await vi.advanceTimersByTimeAsync(0);
    await first;
    resetFirebaseBootstrap();
    const second = ensureFirebaseReady({ forceRetry: true });
    await vi.advanceTimersByTimeAsync(0);
    await second;

    expect(ensureAnonymousAuth).toHaveBeenCalledTimes(2);
  });

  it('skips native app check on web', async () => {
    await expect(ensureFirebaseAppCheckDirect()).resolves.toBeUndefined();
    expect(hasNativeFirebaseAppModule).not.toHaveBeenCalled();
  });
});
