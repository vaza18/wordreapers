/** RTDB retention after `finished`; Cloud Function purges when purgeAfterAt <= now. */
export const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Abandoned waiting/playing rooms; must match functions `ABANDONED_RETENTION_MS`. */
export const ABANDONED_RETENTION_MS = FINISHED_RETENTION_MS;

export function computePurgeAfterAt(fromMs = Date.now()): number {
  return fromMs + FINISHED_RETENTION_MS;
}

/** Apply finished status fields including server-side purge schedule. */
export function withFinishedPurgeFields<T extends { status: string; timerEndsAt: null }>(
  session: T,
  finishedAtMs = Date.now(),
): T & { finishedAt: number; purgeAfterAt: number } {
  return {
    ...session,
    status: 'finished',
    timerEndsAt: null,
    finishedAt: finishedAtMs,
    purgeAfterAt: computePurgeAfterAt(finishedAtMs),
  };
}
