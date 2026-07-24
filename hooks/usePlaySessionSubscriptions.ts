import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import {
  markPlayerOnline,
  tryReadGameSessionSnapshot,
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import {
  getOwnPlayerWords,
  subscribePlayerWords,
  type StoredPlayerWord,
} from '@/lib/firebase/player-words-service';
import { subscribeSessionWordMaps } from '@/lib/firebase/session-word-maps-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import {
  shouldHealPlayUiOnAppState,
  shouldReplaceOwnWordsFromResumeSnapshot,
} from '@/lib/game/compose-resume-heal';
import { shouldMarkPresenceOnline } from '@/lib/online/presence/app-presence-state';
import { mergePlaySessionSubscription } from '@/lib/online/session/play-session-bootstrap';

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

  // After unlock: wait for markPlayerOnline, then re-read so local pause UI is not stuck on
  // stale online:false while peers already see «в грі». Also heal own words if submit
  // committed while the UI/listener was stalled after lock.
  useEffect(() => {
    if (!gameId || !myUid) {
      return undefined;
    }
    const onAppState = (next: AppStateStatus) => {
      if (!shouldHealPlayUiOnAppState(next) || !shouldMarkPresenceOnline(next)) {
        return;
      }
      void (async () => {
        try {
          await markPlayerOnline(gameId, myUid);
        } catch (error) {
          if (__DEV__) {
            console.warn('markPlayerOnline on AppState active', error);
          }
        }
        if (!shouldMarkPresenceOnline(AppState.currentState)) {
          return;
        }
        const [snap, remoteWords] = await Promise.all([
          tryReadGameSessionSnapshot(gameId),
          getOwnPlayerWords(gameId, myUid).catch((error: unknown) => {
            if (__DEV__) {
              console.warn('getOwnPlayerWords on AppState active', error);
            }
            return null;
          }),
        ]);
        if (snap) {
          setSessionCore((prev) => mergePlaySessionSubscription(prev, snap));
        }
        if (remoteWords) {
          setMyWords((prev) => {
            if (
              !shouldReplaceOwnWordsFromResumeSnapshot({
                localNormalized: new Set(prev.keys()),
                remoteNormalized: new Set(remoteWords.keys()),
              })
            ) {
              return prev;
            }
            return remoteWords;
          });
        }
      })();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
    };
  }, [gameId, myUid, setMyWords, setSessionCore]);
}
