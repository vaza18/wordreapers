import { useCallback, useEffect, useState } from 'react';

import {
  fetchSessionPlayerWords,
  subscribeSessionPlayerWords,
} from '@/lib/firebase/player-words-service';
import { mergeAllPlayerWords, type AllPlayerWords } from '@/lib/online/session/clone-player-words';
import { rosterPlayerIdsKey } from '@/lib/online/session/roster-player-ids-key';
import { shouldCompleteWordsBootstrapWithoutFetch } from '@/lib/online/session/words-bootstrap-gate';

const EMPTY_WORDS: AllPlayerWords = new Map();

type UseLiveRosterPlayerWordsParams = {
  gameId: string;
  rosterPlayerIds: string[];
  enabled: boolean;
};

/** Fetch + subscribe to per-player words for a live roster. */
export function useLiveRosterPlayerWords({
  gameId,
  rosterPlayerIds,
  enabled,
}: UseLiveRosterPlayerWordsParams): {
  liveWords: AllPlayerWords;
  wordsBootstrapComplete: boolean;
  resetWords: () => void;
} {
  const [liveWords, setLiveWords] = useState(EMPTY_WORDS);
  const [wordsBootstrapComplete, setWordsBootstrapComplete] = useState(false);
  const rosterKey = rosterPlayerIdsKey(rosterPlayerIds);

  const mergeWords = useCallback((incoming: AllPlayerWords) => {
    setLiveWords((prev) => mergeAllPlayerWords(prev, incoming));
  }, []);

  const resetWords = useCallback(() => {
    setLiveWords(EMPTY_WORDS);
    setWordsBootstrapComplete(false);
  }, []);

  useEffect(() => {
    if (
      shouldCompleteWordsBootstrapWithoutFetch({
        enabled,
        hasGameId: Boolean(gameId),
        rosterLength: rosterPlayerIds.length,
      })
    ) {
      // Empty / disabled roster must not leave results waiting on bootstrap forever
      // (e.g. prior fetch cancelled by cleanup, then roster cleared).
      setWordsBootstrapComplete(true);
      return undefined;
    }

    let cancelled = false;
    setWordsBootstrapComplete(false);
    void fetchSessionPlayerWords(gameId, rosterPlayerIds)
      .then((words) => {
        if (!cancelled) {
          mergeWords(words);
        }
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn('fetchSessionPlayerWords', error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWordsBootstrapComplete(true);
        }
      });

    const unsubWords = subscribeSessionPlayerWords(gameId, rosterPlayerIds, mergeWords);
    return () => {
      cancelled = true;
      unsubWords();
    };
    // rosterKey is the stable identity for rosterPlayerIds contents
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosterPlayerIds via rosterKey
  }, [enabled, gameId, mergeWords, rosterKey]);

  return { liveWords, wordsBootstrapComplete, resetWords };
}
