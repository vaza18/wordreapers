import { useCallback, useEffect, useState } from 'react';

import {
  fetchSessionPlayerWords,
  subscribeSessionPlayerWords,
} from '@/lib/firebase/player-words-service';
import { mergeAllPlayerWords, type AllPlayerWords } from '@/lib/online/clone-player-words';

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

  const mergeWords = useCallback((incoming: AllPlayerWords) => {
    setLiveWords((prev) => mergeAllPlayerWords(prev, incoming));
  }, []);

  const resetWords = useCallback(() => {
    setLiveWords(EMPTY_WORDS);
    setWordsBootstrapComplete(false);
  }, []);

  useEffect(() => {
    if (!enabled || !gameId || rosterPlayerIds.length === 0) {
      return undefined;
    }

    let cancelled = false;
    void fetchSessionPlayerWords(gameId, rosterPlayerIds).then((words) => {
      if (!cancelled) {
        mergeWords(words);
        setWordsBootstrapComplete(true);
      }
    });

    const unsubWords = subscribeSessionPlayerWords(gameId, rosterPlayerIds, mergeWords);
    return () => {
      cancelled = true;
      unsubWords();
    };
  }, [enabled, gameId, mergeWords, rosterPlayerIds]);

  return { liveWords, wordsBootstrapComplete, resetWords };
}
