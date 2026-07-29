/** Exponential backoff between failed timer-expire finish attempts (not a steady 1 Hz poll). */

export const FINISH_RETRY_BACKOFF_CAP_MS = 8000;

/**
 * Delay before the next finish attempt after `consecutiveFails` failed commits.
 * Fail count 1 → 1s, 2 → 2s, 3 → 4s, then capped.
 */
export function finishRetryBackoffMs(consecutiveFails: number): number {
  const n = Math.max(1, consecutiveFails);
  return Math.min(FINISH_RETRY_BACKOFF_CAP_MS, 1000 * 2 ** (n - 1));
}
