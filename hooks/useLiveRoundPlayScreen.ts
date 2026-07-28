import { router } from 'expo-router';
import { useEffect, useRef, type RefObject } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { markPlayerOffline } from '@/lib/firebase/game-session-service';
import { devLogAction } from '@/lib/debug/dev-log';
import { resolvePlayScreenActions } from '@/lib/online/live-round-screen-actions';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import { shouldMarkPresenceOnline } from '@/lib/online/presence/app-presence-state';
import { handoffPlayerPresence } from '@/lib/online/presence/presence-handoff';
import { reconcilePlayerPresence } from '@/lib/online/presence/reconcile-player-presence';
import { shouldClearPresenceReconcileLatch } from '@/lib/online/presence/should-clear-presence-reconcile-latch';
import { createPresenceStuckOfflineRetry } from '@/lib/online/presence/presence-stuck-offline-retry';
import { usePlayerOnlinePresence } from '@/lib/online/presence/use-player-online-presence';
import { useProfileStore } from '@/store/profile-store';

type UseLiveRoundPlayScreenParams = {
  gameId: string;
  myUid: string;
  session: GameSessionSnapshot | null;
  loading: boolean;
  roundEnded: boolean;
  frozenBaseWordRound: number | null | undefined;
  isFocused: boolean;
  leavingIntentionallyRef: RefObject<boolean>;
};

/**
 * Presence, rejoin reconcile, and navigation guards for the online play screen.
 */
export function useLiveRoundPlayScreen({
  gameId,
  myUid,
  session,
  loading,
  roundEnded,
  frozenBaseWordRound,
  isFocused,
  leavingIntentionallyRef,
}: UseLiveRoundPlayScreenParams): void {
  const stalePresenceReconcileRef = useRef<string | null>(null);
  const sawOnlineSinceReconcileLatchRef = useRef(false);
  const reconcileLatchAtRef = useRef<number | null>(null);
  const presenceReconcileInFlightRef = useRef(false);
  const runPresenceReconcileRef = useRef<(roundKey: string) => void>(() => {});
  const stuckOfflineRetryRef = useRef(
    createPresenceStuckOfflineRetry({
      getLatchedRoundKey: () => stalePresenceReconcileRef.current,
      getSawOnlineSinceLatch: () => sawOnlineSinceReconcileLatchRef.current,
      clearLatch: () => {
        stalePresenceReconcileRef.current = null;
        sawOnlineSinceReconcileLatchRef.current = false;
        reconcileLatchAtRef.current = null;
      },
      onRetry: (roundKey) => {
        runPresenceReconcileRef.current(roundKey);
      },
      shouldFireRetry: () => shouldMarkPresenceOnline(AppState.currentState),
    }),
  );

  const clearPresenceReconcileLatch = () => {
    stalePresenceReconcileRef.current = null;
    sawOnlineSinceReconcileLatchRef.current = false;
    reconcileLatchAtRef.current = null;
    stuckOfflineRetryRef.current.clear();
  };

  const actions =
    session && myUid
      ? resolvePlayScreenActions({
          session,
          myUid,
          roundEnded,
          frozenBaseWordRound,
          leavingIntentionally: leavingIntentionallyRef.current ?? false,
        })
      : null;

  usePlayerOnlinePresence(gameId, myUid, Boolean(gameId && myUid && actions?.enablePresenceHook));

  const runPresenceReconcile = (roundKey: string) => {
    if (presenceReconcileInFlightRef.current) {
      return;
    }
    if (!shouldMarkPresenceOnline(AppState.currentState)) {
      return;
    }
    const { name, gender, avatarColorIndex } = useProfileStore.getState();
    presenceReconcileInFlightRef.current = true;
    void reconcilePlayerPresence(gameId, myUid, { name, gender, avatarColorIndex })
      .then(() => {
        stalePresenceReconcileRef.current = roundKey;
        reconcileLatchAtRef.current = Date.now();
        // Re-arm even without a new session snapshot (onDisconnect / silent listener).
        stuckOfflineRetryRef.current.onReconcileSuccess(roundKey);
      })
      .catch((error) => {
        // Do not set loadError / eject — flaky network or App Check must not
        // end the round UI; shouldRejoin will retry on the next snapshot / foreground.
        clearPresenceReconcileLatch();
        devLogAction('presence reconcile failed', {
          level: 'detail',
          room: gameId,
          details: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        presenceReconcileInFlightRef.current = false;
      });
  };
  runPresenceReconcileRef.current = runPresenceReconcile;

  useEffect(() => {
    if (!gameId || !myUid || !session || !actions?.shouldRejoin) {
      stuckOfflineRetryRef.current.clear();
      return;
    }
    // Background offline sets online:false without hasLeft — same shape as presence lag.
    // Pause stuck-offline timer without clearing the latch (resume on AppState active).
    if (!shouldMarkPresenceOnline(AppState.currentState)) {
      stuckOfflineRetryRef.current.clear();
      return;
    }
    const roundKey = `${session.baseWordRound ?? 0}:${session.timerEndsAt ?? 0}`;
    const playerOnline = session.players[myUid]?.online === true;
    if (playerOnline) {
      sawOnlineSinceReconcileLatchRef.current = true;
      stuckOfflineRetryRef.current.clear();
    }
    const msSinceLatch =
      reconcileLatchAtRef.current != null ? Date.now() - reconcileLatchAtRef.current : null;
    if (
      shouldClearPresenceReconcileLatch({
        latchedRoundKey: stalePresenceReconcileRef.current,
        roundKey,
        playerOnline,
        sawOnlineSinceLatch: sawOnlineSinceReconcileLatchRef.current,
        msSinceLatch,
      })
    ) {
      clearPresenceReconcileLatch();
    } else if (stalePresenceReconcileRef.current === roundKey) {
      if (!playerOnline && !sawOnlineSinceReconcileLatchRef.current) {
        stuckOfflineRetryRef.current.arm(roundKey);
      }
      return;
    }
    runPresenceReconcile(roundKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile from store; reconcile on shouldRejoin/session
  }, [actions?.shouldRejoin, frozenBaseWordRound, gameId, myUid, session]);

  // Foreground after background: shouldRejoin may already be true without deps changing — re-run reconcile.
  useEffect(() => {
    if (!gameId || !myUid || !session || !actions?.shouldRejoin) {
      return undefined;
    }
    const roundKey = `${session.baseWordRound ?? 0}:${session.timerEndsAt ?? 0}`;
    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') {
        return;
      }
      if (!shouldMarkPresenceOnline(next)) {
        return;
      }
      // Allow one more reconcile after resume even if this round was marked done while backgrounded.
      if (stalePresenceReconcileRef.current === roundKey) {
        clearPresenceReconcileLatch();
      }
      runPresenceReconcile(roundKey);
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- AppState listener; rebind when rejoin intent changes
  }, [actions?.shouldRejoin, frozenBaseWordRound, gameId, myUid, session]);

  useEffect(() => {
    const stuckOfflineRetry = stuckOfflineRetryRef.current;
    return () => {
      stuckOfflineRetry.clear();
    };
  }, []);

  useEffect(() => {
    if (!isFocused || !gameId || !myUid || !session || !actions?.shouldRedirectToResults) {
      return;
    }
    handoffPlayerPresence(gameId);
    router.replace(onlineResultsRoute(gameId, frozenBaseWordRound ?? undefined));
  }, [actions?.shouldRedirectToResults, frozenBaseWordRound, gameId, isFocused, myUid, session]);

  useEffect(() => {
    if (loading || !session || !myUid || !gameId) {
      return;
    }
    if (actions?.shouldRedirectToLobby) {
      handoffPlayerPresence(gameId);
      router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
      return;
    }
    if (!roundEnded && session.status === 'finished') {
      handoffPlayerPresence(gameId);
      router.replace(onlineResultsRoute(gameId, session.baseWordRound ?? undefined));
    }
  }, [actions?.shouldRedirectToLobby, gameId, loading, myUid, roundEnded, session]);

  useEffect(() => {
    if (!gameId || !myUid || !roundEnded) {
      return;
    }
    if (session?.status === 'playing') {
      return;
    }
    void markPlayerOffline(gameId, myUid);
  }, [gameId, myUid, roundEnded, session?.status]);

  useEffect(() => {
    if (!gameId || !myUid || !actions?.shouldMarkOfflineForPriorRound) {
      return;
    }
    void markPlayerOffline(gameId, myUid);
  }, [actions?.shouldMarkOfflineForPriorRound, gameId, myUid]);
}
