import { useEffect } from 'react';

import { getFinishedRoundArchive } from '@/lib/online/session/online-session-archive';
import {
  loadFrozenFinishedRoundBeforeLive,
  loadFrozenFinishedRoundFromArchive,
  loadLatestFrozenFinishedRoundFromArchive,
  type FrozenFinishedRound,
} from '@/lib/online/session/frozen-finished-round';
import {
  shouldLoadViewingRoundFromArchive,
  shouldRecoverFinishedRoundFromArchive,
} from '@/lib/online/session/frozen-round-view';
import { loadFrozenRoundWithRetry } from '@/lib/online/session/load-frozen-round-with-retry';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';

export type UseFrozenRoundRecoveryOptions = {
  gameId: string;
  sessionLoaded: boolean;
  frozenRound: FrozenFinishedRound | null;
  setFrozenRound: (round: FrozenFinishedRound | null) => void;
  liveSession: GameSessionSnapshot | null;
  viewingBaseWordRound: number | null | undefined;
  freezeAttemptedRef: { current: boolean };
  archivedRef: { current: boolean };
  setArchiveRecoveryPending: (pending: boolean) => void;
  /** Post-join landed on results while live is still playing — skip prior-archive hydrate. */
  fromJoinIntoPlaying?: boolean;
};

async function markArchivedIfAcked(
  gameId: string,
  baseWordRound: number,
  archivedRef: { current: boolean },
): Promise<void> {
  const entry = await getFinishedRoundArchive(gameId, baseWordRound);
  if (entry?.ackSent === true) {
    archivedRef.current = true;
  }
}

/**
 * Load a frozen finished-round snapshot from local archive when RTDB session is missing or stale.
 */
export function useFrozenRoundRecovery({
  gameId,
  sessionLoaded,
  frozenRound,
  setFrozenRound,
  liveSession,
  viewingBaseWordRound,
  freezeAttemptedRef,
  archivedRef,
  setArchiveRecoveryPending,
  fromJoinIntoPlaying = false,
}: UseFrozenRoundRecoveryOptions): void {
  useEffect(() => {
    if (!sessionLoaded || !gameId || frozenRound) {
      return undefined;
    }
    if (!shouldLoadViewingRoundFromArchive(viewingBaseWordRound ?? null, liveSession)) {
      return undefined;
    }
    if (viewingBaseWordRound == null) {
      return undefined;
    }

    let cancelled = false;
    setArchiveRecoveryPending(true);
    void (async () => {
      const archived = await loadFrozenRoundWithRetry(() =>
        loadFrozenFinishedRoundFromArchive(gameId, viewingBaseWordRound),
      );
      if (cancelled) {
        return;
      }
      if (archived) {
        freezeAttemptedRef.current = true;
        setFrozenRound(archived);
        await markArchivedIfAcked(gameId, viewingBaseWordRound, archivedRef);
      }
      if (!cancelled) {
        setArchiveRecoveryPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    archivedRef,
    freezeAttemptedRef,
    frozenRound,
    gameId,
    liveSession,
    sessionLoaded,
    setArchiveRecoveryPending,
    setFrozenRound,
    viewingBaseWordRound,
  ]);

  useEffect(() => {
    if (!sessionLoaded || !gameId || frozenRound) {
      return undefined;
    }
    if (!shouldRecoverFinishedRoundFromArchive(liveSession, { fromJoinIntoPlaying })) {
      return undefined;
    }
    if (viewingBaseWordRound != null) {
      return undefined;
    }

    let cancelled = false;
    setArchiveRecoveryPending(true);
    void (async () => {
      const archived = await loadFrozenRoundWithRetry(async () =>
        liveSession
          ? loadFrozenFinishedRoundBeforeLive(gameId, liveSession.baseWordRound ?? 0)
          : loadLatestFrozenFinishedRoundFromArchive(gameId),
      );
      if (cancelled) {
        return;
      }
      if (archived) {
        freezeAttemptedRef.current = true;
        setFrozenRound(archived);
        const round = archived.session.baseWordRound ?? 0;
        await markArchivedIfAcked(gameId, round, archivedRef);
      }
      if (!cancelled) {
        setArchiveRecoveryPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    archivedRef,
    freezeAttemptedRef,
    frozenRound,
    gameId,
    liveSession,
    sessionLoaded,
    setArchiveRecoveryPending,
    setFrozenRound,
    viewingBaseWordRound,
    fromJoinIntoPlaying,
  ]);
}
