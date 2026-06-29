import type { GameSession } from '../firebase/types.js';

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
  return ctx.liveSession ?? undefined;
}
