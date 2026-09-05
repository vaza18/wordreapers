/**
 * Single-completion barrier for LAN fetchMissing (probe must not resolve while TCP fetch is in flight).
 */
export type FetchMissingSettler = {
  markFetchStarted: () => void;
  /** Idempotent settle — safe from probe and IIFE finally. */
  finish: () => void;
  isSettled: () => boolean;
  /** True when settled or wall-clock past deadline. */
  shouldAbort: () => boolean;
  /** Probe tick: finish only if deadline passed and fetch has not started. */
  onProbeTick: () => void;
};

export function createFetchMissingSettler(input: {
  deadlineMs: number;
  now?: () => number;
  onFinish: () => void;
}): FetchMissingSettler {
  let settled = false;
  let fetchStarted = false;
  const now = input.now ?? (() => Date.now());

  const finish = () => {
    if (settled) {
      return;
    }
    settled = true;
    input.onFinish();
  };

  return {
    markFetchStarted: () => {
      fetchStarted = true;
    },
    finish,
    isSettled: () => settled,
    shouldAbort: () => settled || now() >= input.deadlineMs,
    onProbeTick: () => {
      if (now() >= input.deadlineMs && !fetchStarted) {
        finish();
      }
    },
  };
}
