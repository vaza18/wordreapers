import { useEffect, useRef, type RefObject } from 'react';

import {
  syncSessionPlayerScores,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { sessionPlayerScoresMatchWordMaps } from '@/lib/online/live-standings';
import type { SessionWordMaps } from '@/lib/firebase/types';

type UseSessionScoresSyncParams = {
  gameId: string;
  myUid: string;
  session: GameSessionSnapshot | null;
  wordMaps: SessionWordMaps | null;
  wordMapsRef: RefObject<SessionWordMaps | null>;
};

/**
 * Debounced repair when session player scores drift from word maps.
 */
export function useSessionScoresSync({
  gameId,
  myUid,
  session,
  wordMaps,
  wordMapsRef,
}: UseSessionScoresSyncParams): void {
  const scoresSyncInFlightRef = useRef(false);
  const scoresSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gameId || !myUid || !session || session.status !== 'playing' || !wordMaps) {
      return;
    }
    if (sessionPlayerScoresMatchWordMaps(session) || scoresSyncInFlightRef.current) {
      return;
    }
    if (scoresSyncDebounceRef.current) {
      clearTimeout(scoresSyncDebounceRef.current);
    }
    scoresSyncDebounceRef.current = setTimeout(() => {
      scoresSyncDebounceRef.current = null;
      if (scoresSyncInFlightRef.current) {
        return;
      }
      const maps = wordMapsRef.current;
      if (!maps) {
        return;
      }
      scoresSyncInFlightRef.current = true;
      void syncSessionPlayerScores(gameId, maps).finally(() => {
        scoresSyncInFlightRef.current = false;
      });
    }, 400);
    return () => {
      if (scoresSyncDebounceRef.current) {
        clearTimeout(scoresSyncDebounceRef.current);
        scoresSyncDebounceRef.current = null;
      }
    };
  }, [gameId, myUid, session, wordMaps, wordMapsRef]);
}
