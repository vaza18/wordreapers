import {
  finishGameSessionIfExpired,
  readGameSessionSnapshot,
} from '../firebase/game-session-service.js';
import type { SessionWordMaps } from '../firebase/session-word-maps.js';
import { canOpenOnlineResults } from './play-timer-submit-gate.js';

const DEFAULT_ATTEMPTS = 20;
const DEFAULT_DELAY_MS = 500;

export type EnsureSessionFinishedForResultsOutcome =
  | 'finished'
  /** Peer already rematched — finish-if-expired cannot restore this round. */
  | 'rematch_advanced'
  | 'timeout';

/** Includes UI short-circuit when live session is already finished for the expected round. */
export type OpenResultsEnsureOutcome = EnsureSessionFinishedForResultsOutcome | 'already_finished';

/**
 * Live session can no longer be finished into results for `expectedBaseWordRound`
 * (peer rematched to waiting, or started a later playing round).
 */
export function isResultsFinishBlockedByRematch(options: {
  status: string | undefined;
  baseWordRound?: number | null;
  expectedBaseWordRound?: number | null;
}): boolean {
  if (options.status === 'waiting') {
    return true;
  }
  if (
    options.status === 'playing' &&
    options.expectedBaseWordRound != null &&
    (options.baseWordRound ?? 0) > options.expectedBaseWordRound
  ) {
    return true;
  }
  return false;
}

/**
 * Classify one RTDB snapshot during ensure — `finished` for the expected round,
 * `rematch_advanced` when live moved on, else keep retrying finish.
 */
export function classifyEnsureSessionSnapshot(options: {
  status: string | undefined;
  baseWordRound?: number | null;
  expectedBaseWordRound?: number | null;
}): 'finished' | 'rematch_advanced' | 'continue' {
  if (canOpenOnlineResults(options.status)) {
    if (
      options.expectedBaseWordRound != null &&
      (options.baseWordRound ?? 0) > options.expectedBaseWordRound
    ) {
      return 'rematch_advanced';
    }
    return 'finished';
  }
  if (isResultsFinishBlockedByRematch(options)) {
    return 'rematch_advanced';
  }
  return 'continue';
}

/**
 * Ensure RTDB session is `finished` before opening results (avoids spinner hang when
 * only local round-over ran while status was still `playing`).
 *
 * Fail-fast when live already rematched (`waiting` / later `playing`) — do not spin
 * ~10s of no-op finish retries.
 */
export async function ensureSessionFinishedForResults(
  gameId: string,
  mapsOverride?: SessionWordMaps,
  options?: {
    attempts?: number;
    delayMs?: number;
    expectedBaseWordRound?: number | null;
  },
): Promise<EnsureSessionFinishedForResultsOutcome> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const expectedBaseWordRound = options?.expectedBaseWordRound;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snap = await readGameSessionSnapshot(gameId);
    const before = classifyEnsureSessionSnapshot({
      status: snap.status,
      baseWordRound: snap.baseWordRound,
      expectedBaseWordRound,
    });
    if (before === 'finished') {
      return 'finished';
    }
    if (before === 'rematch_advanced') {
      return 'rematch_advanced';
    }
    await finishGameSessionIfExpired(gameId, mapsOverride);
    const after = await readGameSessionSnapshot(gameId);
    const classified = classifyEnsureSessionSnapshot({
      status: after.status,
      baseWordRound: after.baseWordRound,
      expectedBaseWordRound,
    });
    if (classified === 'finished') {
      return 'finished';
    }
    if (classified === 'rematch_advanced') {
      return 'rematch_advanced';
    }
    if (attempt < attempts - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }
  return 'timeout';
}
