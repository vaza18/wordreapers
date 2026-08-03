import type { GameSession } from '../firebase/types.js';
import type { AllPlayerWords } from './session/clone-player-words.js';
import { totalPlayerWordCount } from './session/live-words-snapshot.js';

export type LeftRoundViewResultsContext = {
  roundStillActive: boolean;
  displaySessionStatus: GameSession['status'] | undefined;
  leftAtBaseWordRound: number | null | undefined;
  liveSession: Pick<GameSession, 'status' | 'baseWordRound'> | null | undefined;
};

/** Show «Переглянути результати» after the round the viewer left has ended (even if rematch already opened). */
export function shouldShowLeftRoundViewResults(ctx: LeftRoundViewResultsContext): boolean {
  if (ctx.roundStillActive) {
    return false;
  }
  const leftRound = ctx.leftAtBaseWordRound;
  if (leftRound == null) {
    return false;
  }
  if (ctx.displaySessionStatus === 'finished') {
    return true;
  }
  const live = ctx.liveSession;
  if (!live) {
    return false;
  }
  const liveRound = live.baseWordRound ?? 0;
  if (liveRound > leftRound) {
    return true;
  }
  return live.status === 'finished' && liveRound === leftRound;
}

/** Pin results to the finished round the viewer left, not a newer live rematch round. */
export function resolveLeftRoundResultsBaseWordRound(
  displaySessionBaseWordRound: number | null | undefined,
  leftAtBaseWordRound: number | null | undefined,
): number | undefined {
  const round = leftAtBaseWordRound ?? displaySessionBaseWordRound;
  return round ?? undefined;
}

export function shouldAcceptLeftRoundFrozenArchive(
  archiveBaseWordRound: number | null | undefined,
  leftAtBaseWordRound: number | null | undefined,
): boolean {
  if (leftAtBaseWordRound == null) {
    return false;
  }
  return (archiveBaseWordRound ?? -1) === leftAtBaseWordRound;
}

export function isLiveSessionForLeftRound(
  leftAtBaseWordRound: number | null | undefined,
  liveSession: Pick<GameSession, 'baseWordRound'> | null | undefined,
): boolean {
  if (leftAtBaseWordRound == null || !liveSession) {
    return false;
  }
  return (liveSession.baseWordRound ?? 0) === leftAtBaseWordRound;
}

export type LeftWordsSnapshotSource = {
  leftAtBaseWordRound: number | null | undefined;
  liveSession: Pick<GameSession, 'status' | 'baseWordRound'> | null | undefined;
  liveWords: AllPlayerWords;
  playingSnapshot: {
    session: Pick<GameSession, 'baseWordRound'>;
    words: AllPlayerWords;
  } | null;
  pinnedFrozenWords: AllPlayerWords | null;
};

/**
 * Left-screen word list: while the left round is still `playing`, use live maps.
 * After finish the roster hook clears — keep the in-memory playing snapshot until freeze.
 */
export function resolveLeftWordsSnapshot(ctx: LeftWordsSnapshotSource): AllPlayerWords {
  if (ctx.pinnedFrozenWords) {
    return ctx.pinnedFrozenWords;
  }
  if (
    isLiveSessionForLeftRound(ctx.leftAtBaseWordRound, ctx.liveSession) &&
    ctx.liveSession?.status === 'playing'
  ) {
    return ctx.liveWords;
  }
  if (
    ctx.leftAtBaseWordRound != null &&
    ctx.playingSnapshot &&
    (ctx.playingSnapshot.session.baseWordRound ?? 0) === ctx.leftAtBaseWordRound
  ) {
    return ctx.playingSnapshot.words;
  }
  if (isLiveSessionForLeftRound(ctx.leftAtBaseWordRound, ctx.liveSession)) {
    return ctx.liveWords;
  }
  // Never show words from a later rematch round while pinned to leftAt.
  return new Map();
}

export function shouldPersistLeftRoundFinishedArchive(
  leftAtBaseWordRound: number | null | undefined,
  liveSession: Pick<GameSession, 'status' | 'baseWordRound'> | null | undefined,
): boolean {
  if (leftAtBaseWordRound == null || !liveSession) {
    return false;
  }
  return (
    liveSession.status === 'finished' && (liveSession.baseWordRound ?? 0) === leftAtBaseWordRound
  );
}

export function shouldLoadLeftRoundFinishedArchive(
  leftAtBaseWordRound: number | null | undefined,
  liveSession: Pick<GameSession, 'status' | 'baseWordRound'> | null | undefined,
  hasPinnedFrozen: boolean,
): boolean {
  if (leftAtBaseWordRound == null || !liveSession || hasPinnedFrozen) {
    return false;
  }
  const liveRound = liveSession.baseWordRound ?? 0;
  if (liveSession.status === 'playing' && liveRound <= leftAtBaseWordRound) {
    return false;
  }
  return liveRound > leftAtBaseWordRound || liveSession.status === 'finished';
}

/** Promote in-memory playing snapshot when rematch advanced before a local archive existed. */
export function shouldFreezeLeftRoundFromPlayingSnapshot(options: {
  leftAtBaseWordRound: number | null | undefined;
  liveSession: Pick<GameSession, 'status' | 'baseWordRound'> | null | undefined;
  hasPinnedFrozen: boolean;
  playingSnapshotBaseWordRound: number | null | undefined;
  /** False when the parked snapshot has no words — fall through to RTDB archive. */
  playingSnapshotHasWords?: boolean;
}): boolean {
  const left = options.leftAtBaseWordRound;
  if (
    options.hasPinnedFrozen ||
    left == null ||
    options.playingSnapshotBaseWordRound !== left ||
    !options.liveSession ||
    options.playingSnapshotHasWords === false
  ) {
    return false;
  }
  const liveRound = options.liveSession.baseWordRound ?? 0;
  return liveRound > left || options.liveSession.status === 'finished';
}

/** Persist/archive miss fallback may freeze the parked snapshot only when it has words. */
export function shouldPromoteLeftPlayingSnapshotFallback(
  words: AllPlayerWords | null | undefined,
): boolean {
  return words != null && totalPlayerWordCount(words) > 0;
}

export type LeftRoundDisplaySource = {
  leftAtBaseWordRound: number | null | undefined;
  liveSession: GameSession | null | undefined;
  pinnedFrozenSession: GameSession | null | undefined;
  playingSnapshotSession: GameSession | null | undefined;
};

/** Keep the left screen pinned to the round the viewer exited, not another local archive. */
export function resolveLeftRoundDisplaySession(
  ctx: LeftRoundDisplaySource,
): GameSession | null | undefined {
  const left = ctx.leftAtBaseWordRound;
  if (
    left != null &&
    ctx.pinnedFrozenSession &&
    (ctx.pinnedFrozenSession.baseWordRound ?? 0) === left
  ) {
    return ctx.pinnedFrozenSession;
  }
  if (isLiveSessionForLeftRound(left, ctx.liveSession)) {
    return ctx.liveSession ?? undefined;
  }
  if (
    left != null &&
    ctx.playingSnapshotSession &&
    (ctx.playingSnapshotSession.baseWordRound ?? 0) === left
  ) {
    return ctx.playingSnapshotSession;
  }
  if (left != null) {
    // Do not fall through to a later rematch session — wait for archive/snapshot freeze.
    return undefined;
  }
  return ctx.liveSession ?? undefined;
}

export type LeftAtRoundSource = 'none' | 'resume' | 'live';

/**
 * Resolve which `baseWordRound` the left screen is pinned to.
 * - Fresh leave during live `playing` with no resume → pin = live.
 * - Cold start / remount with resume N while live is playing N+1 → pin = N (resume).
 * - Parked on left (live or resume pin) while rematch advances → keep exit round.
 *   Stale resume for an older leave is cleared on play via `clearLeftOnlineResumeForGame`.
 */
export function nextLeftAtBaseWordRound(options: {
  previous: number | null;
  previousSource: LeftAtRoundSource;
  liveStatus: GameSession['status'] | undefined;
  liveRound: number;
  resumeRound?: number | null;
}): { round: number | null; source: LeftAtRoundSource } {
  const liveRound = options.liveRound;
  if (options.liveStatus === 'playing') {
    if (options.previous == null || options.previousSource === 'none') {
      if (options.resumeRound != null && options.resumeRound < liveRound) {
        return { round: options.resumeRound, source: 'resume' };
      }
      return { round: liveRound, source: 'live' };
    }
    if (
      (options.previousSource === 'live' || options.previousSource === 'resume') &&
      options.previous < liveRound
    ) {
      return { round: options.previous, source: options.previousSource };
    }
    return { round: options.previous, source: options.previousSource };
  }

  if (options.previous != null && options.previousSource !== 'none') {
    return { round: options.previous, source: options.previousSource };
  }
  if (options.resumeRound != null) {
    return { round: options.resumeRound, source: 'resume' };
  }
  if (options.liveStatus === 'finished') {
    return { round: liveRound, source: 'live' };
  }
  return { round: null, source: 'none' };
}

/**
 * Apply AsyncStorage left-resume after it loads (may race after session already
 * pinned live N+1). Prefer resume N over a newer live pin.
 */
export function nextLeftAtAfterResumePointer(options: {
  previous: number | null;
  previousSource: LeftAtRoundSource;
  resumeRound: number;
}): { round: number; source: LeftAtRoundSource } {
  const { previous, previousSource, resumeRound } = options;
  if (previous == null || previousSource === 'none') {
    return { round: resumeRound, source: 'resume' };
  }
  if (previousSource === 'live' && resumeRound < previous) {
    return { round: resumeRound, source: 'resume' };
  }
  return { round: previous, source: previousSource };
}
