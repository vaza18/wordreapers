/**
 * Block draft validation/submit after the round clock hit zero or local round-over.
 * Mirrors pressKey gating so debounce cannot toast «already entered» at 00:00.
 */
export function shouldBlockWordSubmitWhenTimerElapsed(options: {
  remainingMs: number;
  roundEnded: boolean;
}): boolean {
  return options.roundEnded || options.remainingMs <= 0;
}

/**
 * After client finish-if-expired keeps failing while the clock is already past
 * `timerEndsAt`, force local round-over so time-up UI can appear.
 * Does **not** mean RTDB finish succeeded — keep retrying finish separately.
 */
export function shouldLocalRoundOverAfterFailedExpires(options: {
  timerEndsAt: number | null;
  now: number;
  consecutiveFailedFinishAttempts: number;
  deferFinish: boolean;
  /** Already forced local round-over UI (not RTDB finished). */
  localRoundOverForced: boolean;
  /** Failures required before local round-over (default 2 ≈ ~2s of 1s ticks). */
  failureThreshold?: number;
}): boolean {
  if (options.localRoundOverForced || options.deferFinish) {
    return false;
  }
  if (options.timerEndsAt == null || options.now < options.timerEndsAt) {
    return false;
  }
  const threshold = options.failureThreshold ?? 2;
  return options.consecutiveFailedFinishAttempts >= threshold;
}

/** Results route needs RTDB `finished` — local round-over alone causes a spinner hang. */
export function canOpenOnlineResults(sessionStatus: string | undefined): boolean {
  return sessionStatus === 'finished';
}
