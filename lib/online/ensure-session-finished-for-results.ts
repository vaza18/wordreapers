import {
  finishGameSessionIfExpired,
  readGameSessionEnsureFields,
} from '../firebase/game-session-service.js';
import type { GameSession } from '../firebase/types.js';
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
 *
 * Uses status/round leaves (not full-session get) and optional play subscribe hint
 * so time-up → results does not pay 2× multi-KB downloads.
 */
export async function ensureSessionFinishedForResults(
  gameId: string,
  options?: {
    attempts?: number;
    delayMs?: number;
    expectedBaseWordRound?: number | null;
    /** Play subscribe SoT — skip leaf reads when already finished / drive hint finish. */
    hintSession?: GameSession | null;
    /** Prefer over static hint each attempt (play `sessionCoreRef`). */
    getHintSession?: () => GameSession | null | undefined;
  },
): Promise<EnsureSessionFinishedForResultsOutcome> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const expectedBaseWordRound = options?.expectedBaseWordRound;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const hint = options?.getHintSession?.() ?? options?.hintSession ?? null;
    if (hint) {
      const fromHint = classifyEnsureSessionSnapshot({
        status: hint.status,
        baseWordRound: hint.baseWordRound,
        expectedBaseWordRound,
      });
      if (fromHint === 'finished') {
        return 'finished';
      }
      if (fromHint === 'rematch_advanced') {
        return 'rematch_advanced';
      }
    }

    // FIX: 2026-09 — time-up→results paid 2× full-session get → status/round leaves only
    const fields = await readGameSessionEnsureFields(gameId);
    if (!fields) {
      return 'timeout';
    }
    const before = classifyEnsureSessionSnapshot({
      status: fields.status,
      baseWordRound: fields.baseWordRound,
      expectedBaseWordRound,
    });
    if (before === 'finished') {
      return 'finished';
    }
    if (before === 'rematch_advanced') {
      return 'rematch_advanced';
    }
    await finishGameSessionIfExpired(gameId, { hintSession: hint });
    const hintAfter = options?.getHintSession?.() ?? null;
    if (hintAfter) {
      const fromHintAfter = classifyEnsureSessionSnapshot({
        status: hintAfter.status,
        baseWordRound: hintAfter.baseWordRound,
        expectedBaseWordRound,
      });
      if (fromHintAfter === 'finished') {
        return 'finished';
      }
      if (fromHintAfter === 'rematch_advanced') {
        return 'rematch_advanced';
      }
    }
    const afterFields = await readGameSessionEnsureFields(gameId);
    if (!afterFields) {
      return 'timeout';
    }
    const classified = classifyEnsureSessionSnapshot({
      status: afterFields.status,
      baseWordRound: afterFields.baseWordRound,
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
