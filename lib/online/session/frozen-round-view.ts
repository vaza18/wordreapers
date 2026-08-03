import type { GameSession, SessionWordMaps } from '../../firebase/types.js';
import {
  mergeSessionWithWordMaps,
  type GameSessionWithId,
} from '../../firebase/session-word-maps.js';
import type { AllPlayerWords } from './clone-player-words.js';
import { shouldSkipEmptyArchiveWords } from './archive-words-gate.js';
import { shouldReplaceLiveWordsSnapshot, totalPlayerWordCount } from './live-words-snapshot.js';

/**
 * Frozen-round viewing helpers for play/results when live RTDB advances ahead of the viewer.
 */

// INVARIANT (see docs/known-issues.md — 2026-06 Frozen round results overwritten): frozenBaseWordRound < liveBaseWordRound → keep frozen UI.
/** Keep showing a frozen earlier round while a later round finishes in RTDB. */
export function shouldKeepFrozenResultsOverLiveFinished(
  frozenBaseWordRound: number,
  liveBaseWordRound: number,
): boolean {
  return frozenBaseWordRound < liveBaseWordRound;
}

/** Whether results may freeze the live RTDB `finished` session on first paint. */
export function shouldFreezeLiveFinishedOnResults(
  liveBaseWordRound: number,
  viewingBaseWordRound: number | null | undefined,
): boolean {
  if (viewingBaseWordRound == null) {
    return true;
  }
  return viewingBaseWordRound >= liveBaseWordRound;
}

/** Last ready finished session+words pinned before rematch can disable the roster hook. */
export type ResultsFreezePending = {
  session: GameSession;
  words: AllPlayerWords;
};

/** Keep the latest ready finished pin while status is still finished. */
export function nextResultsFreezePending(
  previous: ResultsFreezePending | null,
  liveSession: GameSession | null | undefined,
  liveWords: AllPlayerWords,
  wordsBootstrapComplete: boolean,
): ResultsFreezePending | null {
  if (liveSession?.status !== 'finished') {
    return previous;
  }
  // Before authoritative bootstrap: latch rich lists only so a fast rematch can
  // still freeze from pending. Never invent an empty pin from incomplete maps.
  if (!wordsBootstrapComplete) {
    if (totalPlayerWordCount(liveWords) === 0) {
      return previous;
    }
    const sameRound =
      previous != null &&
      (previous.session.baseWordRound ?? 0) === (liveSession.baseWordRound ?? 0);
    if (sameRound && !shouldReplaceLiveWordsSnapshot(previous.words, liveWords)) {
      return { session: liveSession, words: previous.words };
    }
    return { session: liveSession, words: liveWords };
  }
  const sameRound =
    previous != null && (previous.session.baseWordRound ?? 0) === (liveSession.baseWordRound ?? 0);
  if (sameRound && !shouldReplaceLiveWordsSnapshot(previous.words, liveWords)) {
    // Same-round rematch wipe must not replace a rich pending pin with empty maps.
    // Never glue prior-round words onto a later finished session (cross-round mismatch).
    return { session: liveSession, words: previous.words };
  }
  return { session: liveSession, words: liveWords };
}

/**
 * Prefer rich same-round pending words over empty live invert (remount /
 * unavailable / wipe while status is still `finished`).
 */
export function resolveFinishedFreezeWords(options: {
  liveSession: GameSession;
  liveWords: AllPlayerWords;
  pending: ResultsFreezePending | null;
}): AllPlayerWords {
  const { liveSession, liveWords, pending } = options;
  const sameRound =
    pending != null &&
    pending.session.status === 'finished' &&
    (pending.session.baseWordRound ?? 0) === (liveSession.baseWordRound ?? 0);
  if (sameRound && !shouldReplaceLiveWordsSnapshot(pending.words, liveWords)) {
    return pending.words;
  }
  return liveWords;
}

/**
 * Freeze from live finished words, or from the pending pin when rematch left
 * `finished` before the freeze effect ran.
 */
export function resolveResultsFreezeSource(options: {
  hasFrozenRound: boolean;
  liveSession: GameSession | null | undefined;
  liveWords: AllPlayerWords;
  wordsBootstrapComplete: boolean;
  viewingBaseWordRound: number | null | undefined;
  pending: ResultsFreezePending | null;
}): ResultsFreezePending | null {
  if (options.hasFrozenRound) {
    return null;
  }
  const { liveSession, liveWords, wordsBootstrapComplete, viewingBaseWordRound, pending } = options;

  const canFreezeLiveFinished =
    liveSession?.status === 'finished' &&
    shouldFreezeLiveFinishedOnResults(liveSession.baseWordRound ?? 0, viewingBaseWordRound) &&
    (wordsBootstrapComplete ||
      (pending != null && totalPlayerWordCount(pending.words) > 0) ||
      totalPlayerWordCount(liveWords) > 0);

  if (canFreezeLiveFinished && liveSession) {
    const words = resolveFinishedFreezeWords({ liveSession, liveWords, pending });
    // Do not lock an empty freeze when live maps still claim words.
    if (shouldSkipEmptyArchiveWords(liveSession, words)) {
      return null;
    }
    // Without bootstrap, only freeze when the resolved lists are already rich.
    if (!wordsBootstrapComplete && totalPlayerWordCount(words) === 0) {
      return null;
    }
    return { session: liveSession, words };
  }

  if (
    pending &&
    pending.session.status === 'finished' &&
    liveSession != null &&
    liveSession.status !== 'finished' &&
    shouldFreezeLiveFinishedOnResults(pending.session.baseWordRound ?? 0, viewingBaseWordRound)
  ) {
    return pending;
  }

  return null;
}

/**
 * Unpinned results: live rematch advanced (`waiting`/`playing`) before freeze or
 * archive recovery — show an error CTA instead of spinning forever on `!viewData`.
 */
export function shouldShowResultsUnavailableAfterRematch(options: {
  hasFrozenRound: boolean;
  archiveRecoveryPending: boolean;
  sessionLoaded: boolean;
  hasFinishedViewData: boolean;
  liveStatus: GameSession['status'] | null | undefined;
}): boolean {
  if (
    options.hasFrozenRound ||
    options.archiveRecoveryPending ||
    !options.sessionLoaded ||
    options.hasFinishedViewData
  ) {
    return false;
  }
  const status = options.liveStatus;
  return status === 'waiting' || status === 'playing';
}

/**
 * Empty freeze from a non-authoritative path must yield to a later rich snapshot
 * (permission_denied → late maps) **for the same round only**.
 * Never upgrade an empty freeze for round N with live finished N+1 words.
 */
export function shouldUpgradeEmptyResultsFreeze(options: {
  frozenWords: AllPlayerWords | null | undefined;
  nextWords: AllPlayerWords;
  frozenBaseWordRound: number;
  liveBaseWordRound: number;
  viewingBaseWordRound?: number | null;
}): boolean {
  if (options.frozenWords == null) {
    return false;
  }
  if (totalPlayerWordCount(options.frozenWords) > 0) {
    return false;
  }
  if (totalPlayerWordCount(options.nextWords) === 0) {
    return false;
  }
  if (options.frozenBaseWordRound !== options.liveBaseWordRound) {
    return false;
  }
  if (
    options.viewingBaseWordRound != null &&
    options.viewingBaseWordRound !== options.liveBaseWordRound
  ) {
    return false;
  }
  return true;
}

export type RecoverFinishedRoundFromArchiveOptions = {
  /**
   * Join/rejoin landed on results while live is still `playing` (no pinned viewing round).
   * Do not hydrate a prior finished archive — that shows «all words» for an old round.
   */
  fromJoinIntoPlaying?: boolean;
};

/** Load archived finished round when live RTDB no longer reflects the viewed round. */
export function shouldRecoverFinishedRoundFromArchive(
  liveSession: GameSession | null | undefined,
  options?: RecoverFinishedRoundFromArchiveOptions,
): boolean {
  if (!liveSession) {
    return true;
  }
  if (options?.fromJoinIntoPlaying === true && liveSession.status === 'playing') {
    return false;
  }
  return liveSession.status === 'waiting' || liveSession.status === 'playing';
}

/** True when results should hydrate from a pinned local archive instead of live RTDB. */
export function shouldLoadViewingRoundFromArchive(
  viewingBaseWordRound: number | null,
  liveSession: GameSession | null | undefined,
): viewingBaseWordRound is number {
  if (viewingBaseWordRound == null) {
    return false;
  }
  if (!liveSession) {
    return true;
  }
  if (liveSession.status === 'waiting' || liveSession.status === 'playing') {
    return true;
  }
  if (liveSession.status === 'finished') {
    // Prefer the archive written on navigate-to-results. Rematch clears
    // `session_word_maps` (and may flip to `waiting`) so live subscribe often hits
    // permission_denied / empty.
    return true;
  }
  return false;
}

/**
 * Live session for rematch/presence on results: after freeze, do not merge
 * stale word maps onto waiting/playing cores (words come from frozenRound).
 */
export function mergeLiveSessionForResults(
  liveSessionCore: GameSessionWithId | null,
  liveWordMaps: SessionWordMaps | null,
  hasFrozenRound: boolean,
): GameSessionWithId | null {
  if (!liveSessionCore) {
    return null;
  }
  if (hasFrozenRound) {
    return liveSessionCore;
  }
  return mergeSessionWithWordMaps(liveSessionCore, liveWordMaps);
}

export type ResultsDisplayRound = {
  session: GameSession;
  words: AllPlayerWords;
};

/**
 * Results UI source: frozen archive, or live only when it matches the viewing pin.
 * Never fall through to a later rematch finished round while `viewingBaseWordRound` is set.
 */
export function resolveResultsDisplayRound(options: {
  frozenRound: { session: GameSession; words: AllPlayerWords } | null;
  liveSession: GameSession | null | undefined;
  liveWords: AllPlayerWords;
  viewingBaseWordRound: number | null | undefined;
}): ResultsDisplayRound | null {
  if (options.frozenRound) {
    return { session: options.frozenRound.session, words: options.frozenRound.words };
  }
  const live = options.liveSession;
  if (!live) {
    return null;
  }
  const viewing = options.viewingBaseWordRound;
  if (viewing != null && (live.baseWordRound ?? 0) !== viewing) {
    return null;
  }
  return { session: live, words: options.liveWords };
}
