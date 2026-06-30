import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';

import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import {
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { subscribePlayerWords, type StoredPlayerWord } from '@/lib/firebase/player-words-service';
import { subscribeSessionWordMaps } from '@/lib/firebase/session-word-maps-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { mergePlaySessionSubscription } from '@/lib/online/play-session-bootstrap';

type UsePlaySessionSubscriptionsParams = {
  gameId: string;
  myUid: string;
  t: TFunction;
  setSessionCore: Dispatch<SetStateAction<GameSessionSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setWordMaps: Dispatch<SetStateAction<SessionWordMaps | null>>;
  setMyWords: Dispatch<SetStateAction<Map<string, StoredPlayerWord>>>;
};

/** RTDB session, word maps, and own words subscriptions for the play screen. */
export function usePlaySessionSubscriptions({
  gameId,
  myUid,
  t,
  setSessionCore,
  setLoading,
  setLoadError,
  setWordMaps,
  setMyWords,
}: UsePlaySessionSubscriptionsParams): void {
  useEffect(() => {
    if (!gameId || !myUid) {
      return undefined;
    }
    let cancelled = false;
    let unsubSession: (() => void) | undefined;
    let unsubMaps: (() => void) | undefined;
    let unsubWords: (() => void) | undefined;

    void ensureAnonymousAuth().then(() => {
      if (cancelled) {
        return;
      }
      unsubSession = subscribeGameSession(gameId, (next) => {
        setSessionCore((prev) => mergePlaySessionSubscription(prev, next));
        setLoading(false);
        if (!next) {
          setLoadError(t('online.errorRoomNotFound'));
        }
      });
      unsubMaps = subscribeSessionWordMaps(gameId, (maps) => {
        queueMicrotask(() => {
          if (!cancelled) {
            setWordMaps(maps);
          }
        });
      });
      unsubWords = subscribePlayerWords(gameId, myUid, setMyWords);
    });

    return () => {
      cancelled = true;
      unsubSession?.();
      unsubMaps?.();
      unsubWords?.();
    };
  }, [gameId, myUid, setLoadError, setLoading, setMyWords, setSessionCore, setWordMaps, t]);
}
