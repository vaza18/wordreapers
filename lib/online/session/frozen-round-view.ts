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
  /**
   * Last finished session while viewing results (survives rematch). Used only with
   * authoritative bootstrap to latch rematch-survival pending — never provisional-only.
   */
  finishedSessionForRematch?: GameSession | null,
): ResultsFreezePending | null {
  if (liveSession?.status === 'finished') {
    // Provisional / incomplete maps must not pin a freeze candidate.
    if (!wordsBootstrapComplete) {
      return previous;
    }
    const sameRound =
      previous != null &&
      (previous.session.baseWordRound ?? 0) === (liveSession.baseWordRound ?? 0);
    if (
      sameRound &&
      !shouldReplaceLiveWordsSnapshot(previous.words, liveWords, { mode: 'grow-only' })
    ) {
      // Same-round rematch wipe must not replace a rich pending pin with empty maps.
      // Never glue prior-round words onto a later finished session (cross-round mismatch).
      return { session: liveSession, words: previous.words };
    }
    return { session: liveSession, words: liveWords };
  }

  // Rematch advanced before freeze: latch only in rematch `waiting` after
  // authoritative/fetch bootstrap using the preserved finished snapshot.
  // Never latch during next-round `playing` (would glue new words onto old finished).
  if (
    liveSession?.status !== 'waiting' ||
    !wordsBootstrapComplete ||
    finishedSessionForRematch == null ||
    finishedSessionForRematch.status !== 'finished' ||
    totalPlayerWordCount(liveWords) === 0
  ) {
    return previous;
  }
  const finishedRound = finishedSessionForRematch.baseWordRound ?? 0;
  const liveRound = liveSession.baseWordRound ?? 0;
  // Canonical rematch waiting is finished+1; refuse skipped/far rounds (I2).
  if (liveRound > finishedRound + 1) {
    return previous;
  }
  const sameRound = previous != null && (previous.session.baseWordRound ?? 0) === finishedRound;
  if (
    sameRound &&
    !shouldReplaceLiveWordsSnapshot(previous.words, liveWords, { mode: 'grow-only' })
  ) {
    return { session: finishedSessionForRematch, words: previous.words };
  }
  return { session: finishedSessionForRematch, words: liveWords };
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
  if (
    sameRound &&
    !shouldReplaceLiveWordsSnapshot(pending.words, liveWords, { mode: 'grow-only' })
  ) {
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
    wordsBootstrapComplete;

  if (canFreezeLiveFinished && liveSession) {
    const words = resolveFinishedFreezeWords({ liveSession, liveWords, pending });
    // Do not lock an empty freeze when live maps still claim words.
    if (shouldSkipEmptyArchiveWords(liveSession, words)) {
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
 * Rematch-survival window still open: suppress rematch-unavailable CTA (show spinner)
 * so late authoritative can latch before the user bails home (C2).
 * Home on the spinner is the broader words-loading escape
 * (`shouldShowResultsWordsLoadingHomeEscape` / `createResultsHomePress('words-loading')`).
 */
export function isResultsRematchSurvivalActive(options: {
  freezeAttempted: boolean;
  lastFinishedCore: GameSession | null | undefined;
  liveStatus: GameSession['status'] | null | undefined;
  mapsUnavailable: boolean;
}): boolean {
  if (
    options.freezeAttempted ||
    options.mapsUnavailable ||
    options.lastFinishedCore == null ||
    options.liveStatus !== 'waiting'
  ) {
    return false;
  }
  return true;
}

/**
 * After rematch wipe: authoritative empty bootstrap with no pending pin — close
 * survival (set freezeAttempted) so maps sub stops and CTA can show.
 *
 * Do **not** close on the first empty paint: get∪fetch can race ahead of the initial
 * child wave (same class as empty-freeze listen). Require
 * {@link RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS} (or caller override) of
 * continuous empty+no-pending so late `onChildAdded` can still latch pending.
 *
 * Do **not** close while {@link mapsUnavailable}: fail-loud must keep survival open
 * for Retry / late rich (defense-in-depth — do not rely only on flipping
 * wordsBootstrapComplete=false in the roster hook).
 */
export const RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS = 2_500;

export function shouldCloseResultsRematchSurvival(options: {
  freezeAttempted: boolean;
  hasFrozenRound: boolean;
  liveStatus: GameSession['status'] | null | undefined;
  wordsBootstrapComplete: boolean;
  liveWords: AllPlayerWords;
  pending: ResultsFreezePending | null;
  /**
   * ms since empty authoritative bootstrap was first observed for this survival
   * window; `null` = not yet a close candidate (or timer not started).
   */
  emptyBootstrapElapsedMs: number | null;
  /** Override for tests; default {@link RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS}. */
  emptyCloseGraceMs?: number;
  /** When true, keep survival open (maps fail-loud / Retry path). */
  mapsUnavailable?: boolean;
}): boolean {
  if (
    options.freezeAttempted ||
    options.hasFrozenRound ||
    options.liveStatus !== 'waiting' ||
    !options.wordsBootstrapComplete ||
    options.pending != null ||
    options.mapsUnavailable === true
  ) {
    return false;
  }
  if (totalPlayerWordCount(options.liveWords) !== 0) {
    return false;
  }
  const grace = options.emptyCloseGraceMs ?? RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS;
  if (options.emptyBootstrapElapsedMs == null || options.emptyBootstrapElapsedMs < grace) {
    return false;
  }
  return true;
}

/**
 * Unpinned results: live rematch advanced (`waiting`/`playing`) before freeze or
 * archive recovery — show an error CTA instead of spinning forever on `!viewData`.
 * While {@link isResultsRematchSurvivalActive}, keep spinner (not rematch-home CTA)
 * but still offer Home via words-loading escape (`shouldShowResultsWordsLoadingHomeEscape`).
 * Prefer {@link resolveResultsErrorCta} on the screen so maps-retry wins over this.
 */
export function shouldShowResultsUnavailableAfterRematch(options: {
  hasFrozenRound: boolean;
  archiveRecoveryPending: boolean;
  sessionLoaded: boolean;
  hasFinishedViewData: boolean;
  liveStatus: GameSession['status'] | null | undefined;
  /** When true, rematch-before-freeze survival is still listening / awaiting latch. */
  rematchSurvivalActive?: boolean;
}): boolean {
  if (
    options.hasFrozenRound ||
    options.archiveRecoveryPending ||
    !options.sessionLoaded ||
    options.hasFinishedViewData ||
    options.rematchSurvivalActive
  ) {
    return false;
  }
  const status = options.liveStatus;
  return status === 'waiting' || status === 'playing';
}

/**
 * Which fail-loud CTA the results screen should show (priority order).
 * `maps-retry` must win over `rematch-home` when seed unavailable **before** results
 * are painted — otherwise Home-only rematch CTA hides retry (C1).
 * Once {@link hasFinishedViewData}, keep RoundResultsView and use an inline banner
 * (play parity) — do not full-screen wipe painted standings.
 */
export type ResultsErrorCta = 'maps-retry' | 'rematch-home' | null;

export function resolveResultsErrorCta(options: {
  viewingBaseWordRound: number | null | undefined;
  hasFrozenRound: boolean;
  archiveRecoveryPending: boolean;
  sessionLoaded: boolean;
  hasFinishedViewData: boolean;
  liveStatus: GameSession['status'] | null | undefined;
  freezeAttempted: boolean;
  lastFinishedCore: GameSession | null | undefined;
  mapsUnavailable: boolean;
}): ResultsErrorCta {
  if (
    options.viewingBaseWordRound != null ||
    options.hasFrozenRound ||
    options.archiveRecoveryPending ||
    !options.sessionLoaded
  ) {
    return null;
  }
  // Pre-paint maps failure: full-screen retry before rematch home-only CTA.
  // Post-paint: return null here — screen shows banner over RoundResultsView.
  if (options.mapsUnavailable) {
    if (options.hasFinishedViewData) {
      return null;
    }
    return 'maps-retry';
  }
  const rematchSurvivalActive = isResultsRematchSurvivalActive({
    freezeAttempted: options.freezeAttempted,
    lastFinishedCore: options.lastFinishedCore,
    liveStatus: options.liveStatus,
    mapsUnavailable: options.mapsUnavailable,
  });
  if (
    shouldShowResultsUnavailableAfterRematch({
      hasFrozenRound: options.hasFrozenRound,
      archiveRecoveryPending: options.archiveRecoveryPending,
      sessionLoaded: options.sessionLoaded,
      hasFinishedViewData: options.hasFinishedViewData,
      liveStatus: options.liveStatus,
      rematchSurvivalActive,
    })
  ) {
    return 'rematch-home';
  }
  return null;
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

/**
 * Whether results should keep `useLiveRosterPlayerWords` enabled.
 * After a **rich** freeze, disable (SoT pinned). After an **empty** freeze, keep
 * listening so late `onChildAdded` (empty get∪fetch raced ahead of child wave)
 * can still upgrade via {@link shouldUpgradeEmptyResultsFreeze} — otherwise
 * `enabled: !frozenRound` tears down the sub and «0 слів» sticks forever.
 */
export function shouldEnableResultsMapsRosterListen(options: {
  hasGameId: boolean;
  rosterPlayerIdsLength: number;
  frozenWords: AllPlayerWords | null | undefined;
}): boolean {
  if (!options.hasGameId || options.rosterPlayerIdsLength <= 0) {
    return false;
  }
  if (options.frozenWords == null) {
    return true;
  }
  return totalPlayerWordCount(options.frozenWords) === 0;
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

/**
 * Roster uids for results maps subscribe. While `finished`, use live players. After rematch
 * `waiting` only (before freeze attempted), keep the last finished roster so late
 * authoritative/fetch can latch rematch-survival pending.
 * **Empty freeze** must not clear the roster (same race as
 * {@link shouldEnableResultsMapsRosterListen}): late `onChildAdded` still need a live sub.
 * **Rich freeze** stops the roster. Do **not** keep the sub into next-round `playing`.
 */
export function computeResultsMapsRosterPlayerIds(options: {
  /** Null = no freeze; empty map = empty freeze (keep roster); rich = stop listen. */
  frozenWords: AllPlayerWords | null | undefined;
  liveSessionCore: GameSession | null | undefined;
  lastFinishedCore: GameSession | null | undefined;
  freezeAttempted: boolean;
}): string[] {
  const { frozenWords, liveSessionCore, lastFinishedCore, freezeAttempted } = options;
  const hasRichFrozenRound = frozenWords != null && totalPlayerWordCount(frozenWords) > 0;
  if (hasRichFrozenRound || !liveSessionCore) {
    return [];
  }
  if (liveSessionCore.status === 'finished') {
    return Object.keys(liveSessionCore.players).sort();
  }
  if (liveSessionCore.status === 'waiting' && lastFinishedCore != null && !freezeAttempted) {
    return Object.keys(lastFinishedCore.players).sort();
  }
  return [];
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
