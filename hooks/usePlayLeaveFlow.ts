import { router } from 'expo-router';
import { useCallback, type RefObject } from 'react';

import { leaveGameSession, type GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { cacheActiveRoundProgress } from '@/lib/online/cache-active-round';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { markPendingRoundArchive } from '@/lib/online/pending-round-archive';
import type { StoredPlayerWord } from '@/lib/firebase/player-words-service';

type UsePlayLeaveFlowParams = {
  gameId: string;
  myUid: string;
  session: GameSessionSnapshot | null;
  myWords: Map<string, StoredPlayerWord>;
  myWordsRef: RefObject<Map<string, StoredPlayerWord>>;
  leavingIntentionallyRef: RefObject<boolean>;
  leftNavigatedRef: RefObject<boolean>;
  onCloseExitConfirm: () => void;
  onCloseGameMenu: () => void;
};

/**
 * Intentional leave during play and exit-to-home flows.
 */
export function usePlayLeaveFlow({
  gameId,
  myUid,
  session,
  myWords,
  myWordsRef,
  leavingIntentionallyRef,
  leftNavigatedRef,
  onCloseExitConfirm,
  onCloseGameMenu,
}: UsePlayLeaveFlowParams) {
  const navigateAfterLeave = useCallback(() => {
    if (!gameId || leftNavigatedRef.current) {
      return;
    }
    leftNavigatedRef.current = true;
    router.replace({ pathname: '/online/left/[gameId]', params: { gameId } });
  }, [gameId, leftNavigatedRef]);

  const runIntentionalLeave = useCallback(() => {
    if (!myUid || !session || session.status !== 'playing') {
      return;
    }
    leavingIntentionallyRef.current = true;
    void markPendingRoundArchive(gameId, session.baseWordRound ?? 0, myUid);
    navigateAfterLeave();
    void (async () => {
      try {
        await cacheActiveRoundProgress(gameId, myUid, session, myWordsRef.current ?? myWords);
        await leaveGameSession(gameId, myUid);
      } catch (error) {
        if (__DEV__) {
          console.warn('runIntentionalLeave', error);
        }
      }
    })();
  }, [gameId, leavingIntentionallyRef, myUid, myWords, myWordsRef, navigateAfterLeave, session]);

  const leaveToHome = useCallback(() => {
    onCloseExitConfirm();
    onCloseGameMenu();
    if (!myUid || !session) {
      router.replace('/');
      return;
    }
    if (session.status === 'playing') {
      runIntentionalLeave();
      return;
    }
    void exitOnlineToHome({
      gameId,
      uid: myUid,
      isOrganizer: session.organizerId === myUid,
      sessionStatus: session.status,
      session,
      myWords,
    });
  }, [gameId, myUid, myWords, onCloseExitConfirm, onCloseGameMenu, runIntentionalLeave, session]);

  return { navigateAfterLeave, runIntentionalLeave, leaveToHome };
}
