import { PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS } from './should-clear-presence-reconcile-latch.js';

export type PresenceStuckOfflineRetryHost = {
  getLatchedRoundKey: () => string | null;
  getSawOnlineSinceLatch: () => boolean;
  clearLatch: () => void;
  onRetry: (roundKey: string) => void;
  /**
   * When false (e.g. AppState background), do not clear the latch or retry.
   * Caller should `clear()` the timer on background and resume on foreground.
   */
  shouldFireRetry?: () => boolean;
};

export type PresenceStuckOfflineRetryOptions = {
  retryMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

/**
 * Schedules stuck-offline presence rejoin retries and re-arms after each attempt
 * so silent RTDB listeners (no new snapshot) still recover without AppState churn.
 *
 * Retries are unbounded while the host keeps calling `onReconcileSuccess` with
 * `sawOnline === false` (~every retryMs). That is intentional for recovery; add a
 * cap/backoff only if production shows RTDB write spam during long desyncs.
 */
export function createPresenceStuckOfflineRetry(
  host: PresenceStuckOfflineRetryHost,
  options: PresenceStuckOfflineRetryOptions = {},
): {
  arm: (roundKey: string) => void;
  clear: () => void;
  /** After successful reconcile: arm again unless session already showed online. */
  onReconcileSuccess: (roundKey: string) => void;
  isArmed: () => boolean;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const retryMs = options.retryMs ?? PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  const clear = () => {
    if (timer != null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  };

  const arm = (roundKey: string) => {
    clear();
    timer = setTimeoutFn(() => {
      timer = null;
      if (host.getLatchedRoundKey() !== roundKey) {
        return;
      }
      // Online→offline flips are handled by the play-screen effect.
      if (host.getSawOnlineSinceLatch()) {
        return;
      }
      // Background / inactive: keep latch; do not no-op-reconcile after clearing it.
      if (host.shouldFireRetry && !host.shouldFireRetry()) {
        return;
      }
      host.clearLatch();
      host.onRetry(roundKey);
    }, retryMs);
  };

  const onReconcileSuccess = (roundKey: string) => {
    if (!host.getSawOnlineSinceLatch()) {
      arm(roundKey);
    }
  };

  return {
    arm,
    clear,
    onReconcileSuccess,
    isArmed: () => timer != null,
  };
}
