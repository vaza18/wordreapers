import { EMPTY_SESSION_WORD_MAPS, type SessionWordMaps } from '../../firebase/session-word-maps.js';
import { normalizedWordsForUid, sameStringSet } from '../word-players-invert.js';
import { shouldReplaceLiveWordMaps, wordPlayersLeafCount } from './live-words-snapshot.js';

/**
 * Play maps listener gate: epoch drops stale microtasks; awaiting blocks stale rich
 * after round reset until wipe empty. Force-sync exhaustion empties UI but still
 * waits for authoritative empty before accepting any non-empty (avoids prior-round
 * rich after delayed clearSessionWordMaps).
 */
export type PlayMapsListenerGate = {
  epoch: number;
  awaitingEmptySync: boolean;
};

export type PlayMapsEventSource = 'snapshot' | 'unavailable';

export type PlayMapsSnapshotSeed = 'provisional' | 'authoritative';

export function createPlayMapsListenerGate(): PlayMapsListenerGate {
  return { epoch: 0, awaitingEmptySync: false };
}

/** Call on local `baseWordRound` clear together with `setWordMaps(null)`. */
export function beginPlayMapsRoundReset(gate: PlayMapsListenerGate): PlayMapsListenerGate {
  return { epoch: gate.epoch + 1, awaitingEmptySync: true };
}

export function isEmptyPlayMaps(maps: SessionWordMaps | null): boolean {
  return wordPlayersLeafCount(maps?.wordPlayers) === 0;
}

/**
 * Play-screen maps listener: grow-only replace (ADR-022) so rematch N× onChildRemoved
 * cannot nibble finished lists; empty wipe mid-play is rejected here.
 * Round-reset empty still goes through `awaitingEmptySync` in decidePlayMapsListenerApply.
 */
export function nextPlayWordMaps(
  previous: SessionWordMaps | null,
  next: SessionWordMaps | null,
): SessionWordMaps | null {
  return shouldReplaceLiveWordMaps(previous, next, { mode: 'grow-only' }) ? next : previous;
}

export type PlayMapsApplyDecision = {
  apply: boolean;
  maps: SessionWordMaps | null;
  gate: PlayMapsListenerGate;
};

function clearAwaiting(gate: PlayMapsListenerGate): PlayMapsListenerGate {
  return { epoch: gate.epoch, awaitingEmptySync: false };
}

/**
 * Decide whether a maps listener/heal payload applies after optional round reset.
 * - Wrong epoch → drop (stale microtask from before reset).
 * - `unavailable` → never apply (permission_denied / error ≠ authoritative empty).
 * - `seed: 'provisional'` → never apply on play (ADR-022: avoid provisional peak
 *   sticking over a smaller authoritative get∪buffer seed; wipe-gate also ignores).
 * - `awaitingEmptySync` → accept authoritative empty (wipe) only; reject non-empty
 *   (incl. after force-sync exhaustion — prior-round rich must not paint the new round).
 * - Otherwise → grow-only via `nextPlayWordMaps` (reject any membership shrink;
 *   rematch progressive wipe must not leave a single word mid-play).
 */
export function decidePlayMapsListenerApply(options: {
  gate: PlayMapsListenerGate;
  callbackEpoch: number;
  previous: SessionWordMaps | null;
  next: SessionWordMaps | null;
  source: PlayMapsEventSource;
  /** Defaults to authoritative when omitted (force-sync / older call sites). */
  seed?: PlayMapsSnapshotSeed;
}): PlayMapsApplyDecision {
  const { gate, callbackEpoch, previous, next, source } = options;
  const seed = options.seed ?? 'authoritative';
  if (callbackEpoch !== gate.epoch) {
    return { apply: false, maps: previous, gate };
  }
  if (source === 'unavailable') {
    return { apply: false, maps: previous, gate };
  }
  if (seed === 'provisional') {
    return { apply: false, maps: previous, gate };
  }
  if (gate.awaitingEmptySync) {
    if (!isEmptyPlayMaps(next)) {
      return { apply: false, maps: previous, gate };
    }
    return {
      apply: true,
      maps: next,
      gate: clearAwaiting(gate),
    };
  }
  const maps = nextPlayWordMaps(previous, next);
  if (maps === previous) {
    return { apply: false, maps: previous, gate };
  }
  return { apply: true, maps, gate };
}

/**
 * Fetch after round reset: apply only empty/null and clear the latch
 * (covers already-empty maps that will not re-emit a seed/`onChild*` empty).
 * Non-empty is treated as stale prior-round cache — leave `awaitingEmptySync`
 * for retries / empty wipe. After retries are exhausted, callers use
 * `decidePlayMapsForceSyncExhaustion` (empty UI; still wait for wipe empty).
 */
export function decidePlayMapsForceSync(options: {
  gate: PlayMapsListenerGate;
  syncEpoch: number;
  next: SessionWordMaps | null;
  previous?: SessionWordMaps | null;
}): PlayMapsApplyDecision {
  const { gate, syncEpoch, next, previous = null } = options;
  if (syncEpoch !== gate.epoch) {
    return { apply: false, maps: previous, gate };
  }
  if (!isEmptyPlayMaps(next)) {
    return { apply: false, maps: previous, gate };
  }
  return {
    apply: true,
    maps: next,
    gate: clearAwaiting(gate),
  };
}

/**
 * Escape hatch when force-sync retries still see rich maps **or** fetch errors
 * out (wipe delayed / RTDB unreachable). Prefer **empty** new-round UI over
 * prior-round rich, keep `awaitingEmptySync` until an authoritative empty
 * snapshot confirms wipe (do not accept rich — that re-imports prior-round words).
 *
 * Callers should best-effort `clearSessionWordMaps` + telemetry after this
 * (wipe only succeeds while session is `waiting`/`finished`).
 * Under `playing`, after {@link PLAY_MAPS_PLAYING_RICH_RECOVERY_MS}, use
 * {@link decidePlayMapsPlayingRichRecovery} (safe only because round start
 * verifies wipe before `waiting → playing`).
 */
export function decidePlayMapsForceSyncExhaustion(options: {
  gate: PlayMapsListenerGate;
  syncEpoch: number;
  previous?: SessionWordMaps | null;
}): PlayMapsApplyDecision {
  const { gate, syncEpoch, previous = null } = options;
  if (syncEpoch !== gate.epoch) {
    return { apply: false, maps: previous, gate };
  }
  return {
    apply: true,
    maps: { ...EMPTY_SESSION_WORD_MAPS },
    gate: { epoch: gate.epoch, awaitingEmptySync: true },
  };
}

/** Delay before post-exhaustion wipe/fetch recovery attempts. */
export const PLAY_MAPS_EXHAUSTION_WIPE_RETRY_MS = 2_000;

/**
 * After wipe-before-play + exhaustion, still-awaiting under `playing` with rich
 * maps: adopt as new-round baseline (empty wipe will not arrive once peers submit).
 * Never use while status is still waiting/finished (prefer wipe retry).
 */
export const PLAY_MAPS_PLAYING_RICH_RECOVERY_MS = 8_000;

export function decidePlayMapsPlayingRichRecovery(options: {
  gate: PlayMapsListenerGate;
  syncEpoch: number;
  next: SessionWordMaps | null;
  previous?: SessionWordMaps | null;
  liveStatus: string | null | undefined;
  exhaustedForMs: number;
  recoveryAfterMs?: number;
}): PlayMapsApplyDecision {
  const {
    gate,
    syncEpoch,
    next,
    previous = null,
    liveStatus,
    exhaustedForMs,
    recoveryAfterMs = PLAY_MAPS_PLAYING_RICH_RECOVERY_MS,
  } = options;
  if (syncEpoch !== gate.epoch || !gate.awaitingEmptySync) {
    return { apply: false, maps: previous, gate };
  }
  if (liveStatus !== 'playing') {
    return { apply: false, maps: previous, gate };
  }
  if (exhaustedForMs < recoveryAfterMs) {
    return { apply: false, maps: previous, gate };
  }
  if (isEmptyPlayMaps(next)) {
    return {
      apply: true,
      maps: next,
      gate: clearAwaiting(gate),
    };
  }
  return {
    apply: true,
    maps: next,
    gate: clearAwaiting(gate),
  };
}

/**
 * Own words from inverted maps.
 * Empty maps clear does not wipe a non-empty local set unless `allowEmptyClear`
 * (round-reset wipe / force-sync exhaustion).
 */
export function nextPlayOwnWordsFromMaps(options: {
  previousOwn: ReadonlySet<string>;
  nextMaps: SessionWordMaps | null;
  myUid: string;
  allowEmptyClear?: boolean;
}): Set<string> {
  const { previousOwn, nextMaps, myUid, allowEmptyClear = false } = options;
  const nextWords = new Set(normalizedWordsForUid(nextMaps?.wordPlayers, myUid));
  if (
    !allowEmptyClear &&
    previousOwn.size > 0 &&
    nextWords.size === 0 &&
    wordPlayersLeafCount(nextMaps?.wordPlayers) === 0
  ) {
    return previousOwn instanceof Set ? previousOwn : new Set(previousOwn);
  }
  return sameStringSet(previousOwn, nextWords) ? (previousOwn as Set<string>) : nextWords;
}

/** Pure commit helper: decision → next maps + own words (no React setState). */
export function commitPlayMapsApply(options: {
  decided: PlayMapsApplyDecision;
  previousOwn: ReadonlySet<string>;
  myUid: string;
  allowEmptyClear: boolean;
}): {
  applied: boolean;
  maps: SessionWordMaps | null;
  ownWords: Set<string>;
  gate: PlayMapsListenerGate;
} {
  const { decided, previousOwn, myUid, allowEmptyClear } = options;
  if (!decided.apply) {
    return {
      applied: false,
      maps: decided.maps,
      ownWords: previousOwn instanceof Set ? previousOwn : new Set(previousOwn),
      gate: decided.gate,
    };
  }
  return {
    applied: true,
    maps: decided.maps,
    ownWords: nextPlayOwnWordsFromMaps({
      previousOwn,
      nextMaps: decided.maps,
      myUid,
      allowEmptyClear,
    }),
    gate: decided.gate,
  };
}
