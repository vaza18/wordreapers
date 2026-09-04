import { shouldLocalRoundOverAfterFailedExpires } from './play-timer-submit-gate.js';

export type ExpireFinishAttemptRefs = {
  finishAttempted: { current: boolean };
  finishInFlight: { current: boolean };
  expiredFailCount: { current: number };
  localRoundOverForced: { current: boolean };
  draftKeyIndices: { current: number[] };
  lastValidatedDraft: { current: string };
};

function maybeForceLocalRoundOver(
  options: {
    endsAt: number;
    deferFinish: boolean;
    refs: ExpireFinishAttemptRefs;
    onLocalRoundOver: () => void;
    getNow: () => number;
  },
  incrementFail: boolean,
): void {
  const { refs } = options;
  if (incrementFail) {
    refs.expiredFailCount.current += 1;
  }
  if (
    shouldLocalRoundOverAfterFailedExpires({
      timerEndsAt: options.endsAt,
      now: options.getNow(),
      consecutiveFailedFinishAttempts: refs.expiredFailCount.current,
      deferFinish: options.deferFinish,
      localRoundOverForced: refs.localRoundOverForced.current,
    })
  ) {
    refs.localRoundOverForced.current = true;
    options.onLocalRoundOver();
  }
}

/**
 * Shared expire path for scheduled wake / AppState `active` — one place for
 * draft clear, in-flight lock, finish retry, and local round-over.
 */
export function beginExpireFinishAttempt(options: {
  endsAt: number;
  now: number;
  deferFinish: boolean;
  refs: ExpireFinishAttemptRefs;
  clearElapsedDraft: () => void;
  onLocalRoundOver: () => void;
  finishIfExpired: () => Promise<boolean>;
  /**
   * Earliest wall-clock for RTDB finish (defaults to `endsAt`).
   * During `[endsAt, commitReadyAt)` only local time-up runs — no full-session get.
   */
  commitReadyAt?: number;
  /** Called when clock elapsed but RTDB finish is still inside submit grace. */
  onBeforeCommitReady?: () => void;
  /** Fresh clock after the async finish attempt (defaults to `now`). */
  getNow?: () => number;
  /** Re-read defer at settle time (add-time vote may appear while finish is in flight). */
  getDeferFinish?: () => boolean;
  /**
   * When finish returns false, heal from RTDB if the remote clock is still running
   * (add-time / pause). Return true to skip counting toward local round-over.
   */
  resyncIfRemoteClockAlive?: () => Promise<boolean>;
  /** After an uncommitted finish (and no remote-clock heal) — schedule backoff retry. */
  onUncommitted?: () => void;
}): void {
  const { endsAt, now, deferFinish, refs } = options;
  const getNow = options.getNow ?? (() => now);
  const resolveDefer = () => options.getDeferFinish?.() ?? deferFinish;
  const commitReadyAt = options.commitReadyAt ?? endsAt;
  if (now < endsAt) {
    refs.expiredFailCount.current = 0;
    return;
  }
  // Do not clear draft while add-time defer is active (AppState can still tick expire).
  if (
    !deferFinish &&
    (refs.draftKeyIndices.current.length > 0 || refs.lastValidatedDraft.current)
  ) {
    options.clearElapsedDraft();
  }
  if (deferFinish || refs.finishAttempted.current || refs.finishInFlight.current) {
    return;
  }

  // FIX: 2026-09 — grace-window finish get spam → local time-up only until commitReadyAt
  if (now < commitReadyAt) {
    if (!refs.localRoundOverForced.current) {
      refs.localRoundOverForced.current = true;
      options.onLocalRoundOver();
    }
    options.onBeforeCommitReady?.();
    return;
  }

  refs.finishInFlight.current = true;
  void options
    .finishIfExpired()
    .then(async (committed) => {
      if (committed) {
        refs.finishAttempted.current = true;
        refs.expiredFailCount.current = 0;
        return;
      }
      if (await options.resyncIfRemoteClockAlive?.()) {
        refs.expiredFailCount.current = 0;
        return;
      }
      maybeForceLocalRoundOver(
        {
          endsAt,
          deferFinish: resolveDefer(),
          refs,
          onLocalRoundOver: options.onLocalRoundOver,
          getNow,
        },
        true,
      );
      options.onUncommitted?.();
    })
    .catch(async () => {
      if (await options.resyncIfRemoteClockAlive?.()) {
        refs.expiredFailCount.current = 0;
        return;
      }
      // Rejected finish must still count toward local time-up (not only false returns).
      maybeForceLocalRoundOver(
        {
          endsAt,
          deferFinish: resolveDefer(),
          refs,
          onLocalRoundOver: options.onLocalRoundOver,
          getNow,
        },
        true,
      );
      options.onUncommitted?.();
    })
    .finally(() => {
      refs.finishInFlight.current = false;
    });
}
