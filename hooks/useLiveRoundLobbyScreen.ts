import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { markPlayerOnline, rejoinExistingPlayer } from '@/lib/firebase/game-session-service';
import { resolveLobbyScreenActions } from '@/lib/online/live-round-screen-actions';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import {
  claimPlayRouteNavigation,
  seedPlaySessionBootstrap,
} from '@/lib/online/play-session-bootstrap';
import { useProfileStore } from '@/store/profile-store';

type UseLiveRoundLobbyScreenParams = {
  gameId: string;
  myUid: string;
  session: GameSessionSnapshot | null;
  isFocused: boolean;
  justOptedIn?: boolean;
  onJoinFailed: (message: string) => void;
};

/**
 * Auto-join live rounds and redirect non-opt-in viewers away from rematch waiting lobby.
 */
export function useLiveRoundLobbyScreen({
  gameId,
  myUid,
  session,
  isFocused,
  justOptedIn,
  onJoinFailed,
}: UseLiveRoundLobbyScreenParams): void {
  const { t } = useTranslation();
  const lateJoinRoundKeyRef = useRef<string | null>(null);
  const rematchPresenceReconcileKeyRef = useRef<string | null>(null);
  const rematchPresenceReconcileInFlightRef = useRef(false);

  const actions =
    session && myUid ? resolveLobbyScreenActions({ session, myUid, justOptedIn }) : null;

  useEffect(() => {
    if (!isFocused || !myUid || !session || !actions) {
      return undefined;
    }

    if (actions.shouldReconcileRematchWaitingPresence) {
      const roundKey = `${session.baseWordRound ?? 0}:rematch-presence`;
      if (
        rematchPresenceReconcileKeyRef.current === roundKey ||
        rematchPresenceReconcileInFlightRef.current
      ) {
        return undefined;
      }
      rematchPresenceReconcileInFlightRef.current = true;
      const { name, gender, avatarColorIndex } = useProfileStore.getState();
      void rejoinExistingPlayer(gameId, myUid, { name, gender, avatarColorIndex })
        .then(() => markPlayerOnline(gameId, myUid))
        .then(() => {
          rematchPresenceReconcileKeyRef.current = roundKey;
        })
        .catch((error) => {
          rematchPresenceReconcileKeyRef.current = null;
          onJoinFailed(t('online.errorJoinFailed'));
          if (__DEV__) {
            console.warn('lobby rematch waiting presence reconcile', error);
          }
        })
        .finally(() => {
          rematchPresenceReconcileInFlightRef.current = false;
        });
      return undefined;
    }

    if (actions.shouldRedirectNonOptInViewer) {
      const priorRound = Math.max(0, (session.baseWordRound ?? 1) - 1);
      router.replace(onlineResultsRoute(gameId, priorRound));
      return undefined;
    }

    if (actions.shouldNavigateToPlay) {
      const snapshot = { ...session, id: gameId };
      if (claimPlayRouteNavigation(gameId, snapshot)) {
        seedPlaySessionBootstrap(snapshot);
        router.replace({ pathname: '/online/play/[gameId]', params: { gameId } });
      }
      return undefined;
    }

    if (!actions.shouldAutoJoinLiveRound) {
      return undefined;
    }

    const roundKey = `${session.baseWordRound ?? 0}:${session.timerEndsAt ?? 0}`;
    if (lateJoinRoundKeyRef.current === roundKey) {
      return undefined;
    }
    lateJoinRoundKeyRef.current = roundKey;

    let cancelled = false;
    const { name, gender, avatarColorIndex } = useProfileStore.getState();
    void rejoinExistingPlayer(gameId, myUid, { name, gender, avatarColorIndex })
      .then(() => markPlayerOnline(gameId, myUid))
      .then(() => {
        if (!cancelled) {
          const snapshot = { ...session, id: gameId };
          if (claimPlayRouteNavigation(gameId, snapshot)) {
            seedPlaySessionBootstrap(snapshot);
            router.replace({ pathname: '/online/play/[gameId]', params: { gameId } });
          }
        }
      })
      .catch((error) => {
        lateJoinRoundKeyRef.current = null;
        onJoinFailed(t('online.errorJoinFailed'));
        if (__DEV__) {
          console.warn('lobby late join live round', error);
        }
      });

    return () => {
      cancelled = true;
      lateJoinRoundKeyRef.current = null;
    };
  }, [actions, gameId, isFocused, myUid, session, t, onJoinFailed]);
}
