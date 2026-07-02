import { router } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

import { finishGameSessionIfExpired } from '@/lib/firebase/game-session-service';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { getServerNow } from '@/lib/firebase/server-clock';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { archiveFinishedRoundFromFirebase } from '@/lib/online/archive-finished-round-from-firebase';
import { shouldKeepFrozenResultsOverLiveFinished } from '@/lib/online/frozen-round-view';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import { resolveRoundEndSessionSnapshot } from '@/lib/online/resolve-round-end-session-snapshot';
import type { StoredPlayerWord } from '@/lib/firebase/player-words-service';

type UseRoundEndFlowParams = {
  gameId: string;
  session: GameSessionSnapshot | null;
  myWords: Map<string, StoredPlayerWord>;
  roundEnded: boolean;
  roundOverPendingResults: boolean;
  setRoundOverPendingResults: Dispatch<SetStateAction<boolean>>;
  roundEndWordsSnapshot: Map<string, StoredPlayerWord> | null;
  setRoundEndWordsSnapshot: Dispatch<SetStateAction<Map<string, StoredPlayerWord> | null>>;
  roundEndSessionSnapshot: GameSessionSnapshot | null;
  setRoundEndSessionSnapshot: Dispatch<SetStateAction<GameSessionSnapshot | null>>;
  playRoundKeyRef: RefObject<number | null>;
  resultsNavigatedRef: RefObject<boolean>;
  finishAttemptedRef: RefObject<boolean>;
  leavingIntentionallyRef: RefObject<boolean>;
  leftNavigatedRef: RefObject<boolean>;
  staleWordsReconcileKeyRef: RefObject<string | null>;
  wordMapsRef: RefObject<SessionWordMaps | null>;
  debounceRef: RefObject<ReturnType<typeof setTimeout> | null>;
  endsAt: number | null;
  isPaused: boolean;
  hasAddTimeVote: boolean;
};

/**
 * Round-end snapshots, timer expiry finish, archive, and navigation to results.
 */
export function useRoundEndFlow({
  gameId,
  session,
  myWords,
  roundEnded,
  roundOverPendingResults,
  setRoundOverPendingResults,
  roundEndWordsSnapshot,
  setRoundEndWordsSnapshot,
  roundEndSessionSnapshot,
  setRoundEndSessionSnapshot,
  playRoundKeyRef,
  resultsNavigatedRef,
  finishAttemptedRef,
  leavingIntentionallyRef,
  leftNavigatedRef,
  staleWordsReconcileKeyRef,
  wordMapsRef,
  debounceRef,
  endsAt,
  isPaused,
  hasAddTimeVote,
}: UseRoundEndFlowParams) {
  const finishedArchiveRoundRef = useRef<number | null>(null);

  useEffect(() => {
    const round = session?.baseWordRound ?? null;
    if (round == null) {
      return;
    }
    if (playRoundKeyRef.current !== null && playRoundKeyRef.current !== round) {
      resultsNavigatedRef.current = false;
      leftNavigatedRef.current = false;
      finishAttemptedRef.current = false;
      leavingIntentionallyRef.current = false;
      staleWordsReconcileKeyRef.current = null;
    }
    playRoundKeyRef.current = round;
  }, [
    finishAttemptedRef,
    leavingIntentionallyRef,
    leftNavigatedRef,
    playRoundKeyRef,
    resultsNavigatedRef,
    session?.baseWordRound,
    staleWordsReconcileKeyRef,
  ]);

  useEffect(() => {
    if (session?.status === 'finished') {
      setRoundOverPendingResults(true);
    }
  }, [session?.status, setRoundOverPendingResults]);

  useEffect(() => {
    if (!roundEnded) {
      setRoundEndWordsSnapshot(null);
      setRoundEndSessionSnapshot(null);
      return;
    }
    setRoundEndWordsSnapshot((prev) => {
      if (prev !== null) {
        return prev;
      }
      if (myWords.size === 0) {
        return null;
      }
      return new Map(myWords);
    });
  }, [myWords, roundEnded, setRoundEndSessionSnapshot, setRoundEndWordsSnapshot]);

  useEffect(() => {
    if (!gameId || session?.status !== 'finished') {
      return;
    }
    setRoundEndSessionSnapshot((prev) =>
      resolveRoundEndSessionSnapshot(prev, { ...session, id: gameId }),
    );
  }, [gameId, session, setRoundEndSessionSnapshot]);

  useEffect(() => {
    if (!gameId || !session || session.status !== 'finished') {
      return;
    }
    const liveRound = session.baseWordRound ?? 0;
    const frozenRound = roundEndSessionSnapshot?.baseWordRound;
    if (frozenRound != null && shouldKeepFrozenResultsOverLiveFinished(frozenRound, liveRound)) {
      return;
    }
    if (finishedArchiveRoundRef.current === liveRound) {
      return;
    }
    finishedArchiveRoundRef.current = liveRound;
    void archiveFinishedRoundFromFirebase(gameId, session).catch((error) => {
      if (__DEV__) {
        console.warn('archiveFinishedRoundFromFirebase', error);
      }
    });
  }, [gameId, roundEndSessionSnapshot?.baseWordRound, session]);

  useEffect(() => {
    if (isPaused || session?.status !== 'playing' || endsAt === null || hasAddTimeVote) {
      return undefined;
    }
    const tick = () => {
      if (finishAttemptedRef.current || getServerNow() >= endsAt) {
        if (!finishAttemptedRef.current) {
          void finishGameSessionIfExpired(gameId, wordMapsRef.current ?? undefined).then(
            (committed) => {
              if (committed) {
                finishAttemptedRef.current = true;
              }
            },
          );
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
    };
  }, [endsAt, finishAttemptedRef, gameId, hasAddTimeVote, isPaused, session?.status, wordMapsRef]);

  const navigateToResults = useCallback(async () => {
    if (!gameId || resultsNavigatedRef.current || !session) {
      return;
    }
    if (session.status !== 'finished' && !roundOverPendingResults) {
      return;
    }
    resultsNavigatedRef.current = true;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const archiveSession = roundEndSessionSnapshot ?? session;
    const viewingRound = archiveSession.baseWordRound ?? null;
    router.replace(onlineResultsRoute(gameId, viewingRound));
    try {
      if (archiveSession.status === 'finished') {
        await archiveFinishedRoundFromFirebase(gameId, archiveSession);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('archiveFinishedRoundFromFirebase', error);
      }
    }
  }, [
    debounceRef,
    gameId,
    resultsNavigatedRef,
    roundEndSessionSnapshot,
    roundOverPendingResults,
    session,
  ]);

  return { navigateToResults, roundEndWordsSnapshot };
}
