import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS } from '../lib/online/presence/should-clear-presence-reconcile-latch.js';
import { createPresenceStuckOfflineRetry } from '../lib/online/presence/presence-stuck-offline-retry.js';

describe('createPresenceStuckOfflineRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires retry after cooldown when still latched and never saw online', () => {
    let latched: string | null = '1:100';
    const clearLatch = vi.fn(() => {
      latched = null;
    });
    const onRetry = vi.fn();
    const retry = createPresenceStuckOfflineRetry({
      getLatchedRoundKey: () => latched,
      getSawOnlineSinceLatch: () => false,
      clearLatch,
      onRetry,
    });

    retry.arm('1:100');
    expect(retry.isArmed()).toBe(true);

    vi.advanceTimersByTime(PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS - 1);
    expect(onRetry).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(clearLatch).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith('1:100');
    expect(retry.isArmed()).toBe(false);
  });

  it('re-arms after reconcile success so a second retry runs without a new snapshot', () => {
    let latched: string | null = null;
    const sawOnline = false;
    const onRetry = vi.fn((roundKey: string) => {
      // Simulate successful reconcile that latches again but session stays offline.
      latched = roundKey;
      retry.onReconcileSuccess(roundKey);
    });
    const retry = createPresenceStuckOfflineRetry({
      getLatchedRoundKey: () => latched,
      getSawOnlineSinceLatch: () => sawOnline,
      clearLatch: () => {
        latched = null;
      },
      onRetry,
    });

    latched = '1:100';
    retry.onReconcileSuccess('1:100');
    expect(retry.isArmed()).toBe(true);

    vi.advanceTimersByTime(PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(latched).toBe('1:100');
    expect(retry.isArmed()).toBe(true);

    vi.advanceTimersByTime(PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('does not retry when session already showed online', () => {
    const onRetry = vi.fn();
    const retry = createPresenceStuckOfflineRetry({
      getLatchedRoundKey: () => '1:100',
      getSawOnlineSinceLatch: () => true,
      clearLatch: vi.fn(),
      onRetry,
    });

    retry.arm('1:100');
    vi.advanceTimersByTime(PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('clear cancels a pending retry', () => {
    const onRetry = vi.fn();
    const retry = createPresenceStuckOfflineRetry({
      getLatchedRoundKey: () => '1:100',
      getSawOnlineSinceLatch: () => false,
      clearLatch: vi.fn(),
      onRetry,
    });

    retry.arm('1:100');
    retry.clear();
    vi.advanceTimersByTime(PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS);
    expect(onRetry).not.toHaveBeenCalled();
    expect(retry.isArmed()).toBe(false);
  });

  it('does not clear latch or retry when shouldFireRetry is false (background)', () => {
    let latched: string | null = '1:100';
    const clearLatch = vi.fn(() => {
      latched = null;
    });
    const onRetry = vi.fn();
    const retry = createPresenceStuckOfflineRetry({
      getLatchedRoundKey: () => latched,
      getSawOnlineSinceLatch: () => false,
      clearLatch,
      onRetry,
      shouldFireRetry: () => false,
    });

    retry.arm('1:100');
    vi.advanceTimersByTime(PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS);
    expect(clearLatch).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    expect(latched).toBe('1:100');
  });
});
