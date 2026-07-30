export type EnsureAppCheckFn = () => Promise<void>;

/** Default backoff before each attempt (first try is immediate). */
export const APP_CHECK_SUBSCRIBE_RETRY_DELAYS_MS = [0, 400, 1200] as const;

/**
 * Await App Check with short retries. Returns false if every attempt fails —
 * callers must not open RTDB listeners without a token (Enforce-ready).
 */
export async function ensureAppCheckWithRetry(
  ensure: EnsureAppCheckFn,
  options?: {
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
    onAttemptError?: (error: unknown, attemptIndex: number) => void;
  },
): Promise<boolean> {
  const delaysMs = options?.delaysMs ?? APP_CHECK_SUBSCRIBE_RETRY_DELAYS_MS;
  const sleep =
    options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attemptIndex = 0; attemptIndex < delaysMs.length; attemptIndex++) {
    const delay = delaysMs[attemptIndex] ?? 0;
    if (delay > 0) {
      await sleep(delay);
    }
    try {
      await ensure();
      return true;
    } catch (error) {
      options?.onAttemptError?.(error, attemptIndex);
    }
  }
  return false;
}
