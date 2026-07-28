/** Cooldown before retrying rejoin when reconcile succeeded but session never showed online. */
export const PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS = 4_000;

/**
 * After a successful presence reconcile for `roundKey`, clear the latch to allow
 * another reconcile when:
 * - session showed `online: true` then went offline again, or
 * - reconcile claimed success but session stayed offline past the stuck-offline cooldown
 *   (onDisconnect / network race while AppState stays active — no foreground event).
 *
 * Dual path with `createPresenceStuckOfflineRetry`: `msSinceLatch` covers the case
 * where session snapshots keep arriving (timer would keep resetting via `arm`);
 * the timer covers silent listeners with no further snapshots. Do not remove either
 * without replacing both roles.
 *
 * Do not set `sawOnlineSinceLatch` from reconcile `.then()` — that re-triggers spam
 * on every snapshot while RTDB still reports offline.
 */
export function shouldClearPresenceReconcileLatch(params: {
  latchedRoundKey: string | null;
  roundKey: string;
  playerOnline: boolean;
  /** True only after the session showed `online: true` while this latch held. */
  sawOnlineSinceLatch: boolean;
  /** Elapsed ms since the latch was set; enables stuck-offline retry. */
  msSinceLatch?: number | null;
  stuckOfflineRetryMs?: number;
}): boolean {
  if (params.latchedRoundKey !== params.roundKey) {
    return false;
  }
  if (params.playerOnline) {
    return false;
  }
  if (params.sawOnlineSinceLatch === true) {
    return true;
  }
  const retryMs = params.stuckOfflineRetryMs ?? PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS;
  const elapsed = params.msSinceLatch;
  return typeof elapsed === 'number' && elapsed >= retryMs;
}
