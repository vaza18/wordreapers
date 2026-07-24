import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  readGameSessionSnapshot,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { resolveLobbyScreenActions } from '@/lib/online/live-round-screen-actions';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import { handoffPlayerPresence } from '@/lib/online/presence/presence-handoff';
import {
  claimPlayRouteNavigation,
  seedPlaySessionBootstrap,
} from '@/lib/online/session/play-session-bootstrap';
import { shouldLatchRematchLobbyOptIn } from '@/lib/online/session/rematch-lobby-opt-in-latch';
import { reconcilePlayerPresence } from '@/lib/online/presence/reconcile-player-presence';
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
  const rematchOptInLatchedRef = useRef(false);
  const rematchOptInLatchRoundRef = useRef<number | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const rematchRound = session?.baseWordRound ?? 0;

  useEffect(() => {
    lateJoinRoundKeyRef.current = null;
    rematchPresenceReconcileKeyRef.current = null;
    rematchOptInLatchedRef.current = false;
    rematchOptInLatchRoundRef.current = null;
  }, [gameId]);

  // Latch in render (not an effect) so a round bump cannot clear after we re-set from online.
  if (rematchOptInLatchRoundRef.current !== rematchRound) {
    rematchOptInLatchRoundRef.current = rematchRound;
    rematchOptInLatchedRef.current = false;
  }
  if (
    shouldLatchRematchLobbyOptIn({
      session,
      myUid,
      justOptedIn,
    })
  ) {
    rematchOptInLatchedRef.current = true;
  }

  const lobbyFlags = useMemo(() => {
    if (!session || !myUid) {
      return null;
    }
    const actions = resolveLobbyScreenActions({
      session,
      myUid,
      justOptedIn,
      rematchOptInLatched: rematchOptInLatchedRef.current,
    });
    return {
      ...actions,
      baseWordRound: session.baseWordRound ?? 0,
      timerEndsAt: session.timerEndsAt ?? 0,
    };
  }, [justOptedIn, myUid, session]);

  useEffect(() => {
    if (!isFocused || !myUid || !session || !lobbyFlags) {
      return undefined;
    }

    if (lobbyFlags.shouldRedirectNonOptInViewer) {
      const priorRound = Math.max(0, (session.baseWordRound ?? 1) - 1);
      router.replace(onlineResultsRoute(gameId, priorRound));
      return undefined;
    }

    if (lobbyFlags.shouldNavigateToPlay) {
      const snapshot = { ...session, id: gameId };
      if (claimPlayRouteNavigation(gameId, snapshot)) {
        seedPlaySessionBootstrap(snapshot);
        handoffPlayerPresence(gameId);
        router.replace({ pathname: '/online/play/[gameId]', params: { gameId } });
      }
      return undefined;
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitive lobby flags, not `lobbyFlags` object
  }, [
    gameId,
    isFocused,
    lobbyFlags?.shouldNavigateToPlay,
    lobbyFlags?.shouldRedirectNonOptInViewer,
    myUid,
    session,
  ]);

  useEffect(() => {
    if (!isFocused || !myUid || !session || !lobbyFlags?.shouldReconcileRematchWaitingPresence) {
      return undefined;
    }

    const roundKey = `${lobbyFlags.baseWordRound}:rematch-presence`;
    if (
      rematchPresenceReconcileKeyRef.current === roundKey ||
      rematchPresenceReconcileInFlightRef.current
    ) {
      return undefined;
    }

    rematchPresenceReconcileInFlightRef.current = true;
    const { name, gender, avatarColorIndex } = useProfileStore.getState();
    void reconcilePlayerPresence(gameId, myUid, { name, gender, avatarColorIndex })
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
  }, [
    gameId,
    isFocused,
    lobbyFlags?.baseWordRound,
    lobbyFlags?.shouldReconcileRematchWaitingPresence,
    myUid,
    onJoinFailed,
    session,
    t,
  ]);

  useEffect(() => {
    if (!isFocused || !myUid || !session || !lobbyFlags?.shouldAutoJoinLiveRound) {
      return undefined;
    }

    const roundKey = `${lobbyFlags.baseWordRound}:${lobbyFlags.timerEndsAt}`;
    if (lateJoinRoundKeyRef.current === roundKey) {
      return undefined;
    }
    lateJoinRoundKeyRef.current = roundKey;

    let cancelled = false;
    const { name, gender, avatarColorIndex } = useProfileStore.getState();
    void reconcilePlayerPresence(gameId, myUid, { name, gender, avatarColorIndex })
      .then(async () => {
        if (cancelled) {
          return;
        }
        const liveSession = (await readGameSessionSnapshot(gameId)) ?? sessionRef.current;
        if (!liveSession) {
          return;
        }
        const snapshot = { ...liveSession, id: gameId };
        if (claimPlayRouteNavigation(gameId, snapshot)) {
          seedPlaySessionBootstrap(snapshot);
          handoffPlayerPresence(gameId);
          router.replace({ pathname: '/online/play/[gameId]', params: { gameId } });
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
    };
  }, [
    gameId,
    isFocused,
    lobbyFlags?.baseWordRound,
    lobbyFlags?.shouldAutoJoinLiveRound,
    lobbyFlags?.timerEndsAt,
    myUid,
    onJoinFailed,
    session,
    t,
  ]);
}
