import { router } from 'expo-router';
import { useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { markPlayerOffline } from '@/lib/firebase/game-session-service';
import { resolvePlayScreenActions } from '@/lib/online/live-round-screen-actions';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import { reconcilePlayerPresence } from '@/lib/online/reconcile-player-presence';
import { usePlayerOnlinePresence } from '@/lib/online/use-player-online-presence';
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
  onJoinFailed: (message: string) => void;
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
  onJoinFailed,
}: UseLiveRoundPlayScreenParams): void {
  const { t } = useTranslation();
  const stalePresenceReconcileRef = useRef<string | null>(null);
  const presenceReconcileInFlightRef = useRef(false);

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

  useEffect(() => {
    if (!gameId || !myUid || !session || !actions?.shouldRejoin) {
      return;
    }
    const roundKey = `${session.baseWordRound ?? 0}:${session.timerEndsAt ?? 0}`;
    if (stalePresenceReconcileRef.current === roundKey) {
      return;
    }
    if (presenceReconcileInFlightRef.current) {
      return;
    }
    const { name, gender, avatarColorIndex } = useProfileStore.getState();
    presenceReconcileInFlightRef.current = true;
    void reconcilePlayerPresence(gameId, myUid, { name, gender, avatarColorIndex })
      .then(() => {
        stalePresenceReconcileRef.current = roundKey;
      })
      .catch((error) => {
        stalePresenceReconcileRef.current = null;
        onJoinFailed(t('online.errorJoinFailed'));
        if (__DEV__) {
          console.warn('rejoinExistingPlayer presence reconcile', error);
        }
      })
      .finally(() => {
        presenceReconcileInFlightRef.current = false;
      });
  }, [actions?.shouldRejoin, frozenBaseWordRound, gameId, myUid, onJoinFailed, session, t]);

  useEffect(() => {
    if (!isFocused || !gameId || !myUid || !session || !actions?.shouldRedirectToResults) {
      return;
    }
    router.replace(onlineResultsRoute(gameId, frozenBaseWordRound ?? undefined));
  }, [actions?.shouldRedirectToResults, frozenBaseWordRound, gameId, isFocused, myUid, session]);

  useEffect(() => {
    if (!isFocused || loading || !session || !myUid || !gameId) {
      return;
    }
    if (actions?.shouldRedirectToLobby) {
      router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
      return;
    }
    if (!roundEnded && session.status === 'finished') {
      router.replace(onlineResultsRoute(gameId, session.baseWordRound ?? undefined));
    }
  }, [actions?.shouldRedirectToLobby, gameId, isFocused, loading, myUid, roundEnded, session]);

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
