import { useEffect, useState } from 'react';

import {
  subscribeSessionWordMaps,
  tryFetchSessionWordMaps,
} from '@/lib/firebase/session-word-maps-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { wordsByPlayerFromWordPlayers } from '@/lib/online/word-players-invert';
import type { AllPlayerWords } from '@/lib/online/session/clone-player-words';
import {
  liveWordMapsSignature,
  liveWordsSignature,
  shouldReplaceLiveWordMaps,
  shouldReplaceLiveWordsSnapshot,
} from '@/lib/online/session/live-words-snapshot';
import { shouldCompleteWordsBootstrapWithoutFetch } from '@/lib/online/session/words-bootstrap-gate';

const EMPTY_WORDS: AllPlayerWords = new Map();

type UseLiveRosterPlayerWordsParams = {
  gameId: string;
  /** Used only for bootstrap fetch gate (empty roster = listen-only). */
  rosterPlayerIds: string[];
  enabled: boolean;
};

/** Fetch + subscribe to session word maps once; invert to per-player word lists. */
export function useLiveRosterPlayerWords({
  gameId,
  rosterPlayerIds,
  enabled,
}: UseLiveRosterPlayerWordsParams): {
  liveWords: AllPlayerWords;
  liveWordMaps: SessionWordMaps | null;
  wordsBootstrapComplete: boolean;
} {
  const [liveWords, setLiveWords] = useState(EMPTY_WORDS);
  const [liveWordMaps, setLiveWordMaps] = useState<SessionWordMaps | null>(null);
  const [wordsBootstrapComplete, setWordsBootstrapComplete] = useState(false);

  useEffect(() => {
    if (!enabled || !gameId) {
      // Keep last non-empty words on disable (rematch may clear roster before freeze).
      // Drop only when leaving the room entirely so empty-clear guards stay room-local.
      // Do NOT mark bootstrap complete here — stale-true freezes empty results (C1).
      if (!gameId) {
        setLiveWords(EMPTY_WORDS);
        setLiveWordMaps(null);
        setWordsBootstrapComplete(false);
      }
      return undefined;
    }

    // New gameId / re-enable: clear before subscribe so richness-guard is room-local.
    setLiveWords(EMPTY_WORDS);
    setLiveWordMaps(null);
    setWordsBootstrapComplete(false);

    let cancelled = false;
    /** Once `onValue` has applied, ignore a slow bootstrap fetch (stale last-write). */
    let heardListener = false;
    let bootstrapComplete = false;

    const markBootstrapComplete = () => {
      if (cancelled || bootstrapComplete) {
        return;
      }
      bootstrapComplete = true;
      setWordsBootstrapComplete(true);
    };

    const applyMaps = (maps: SessionWordMaps | null) => {
      const nextWords = wordsByPlayerFromWordPlayers(maps?.wordPlayers);
      setLiveWords((prev) => {
        if (!shouldReplaceLiveWordsSnapshot(prev, nextWords)) {
          return prev;
        }
        if (liveWordsSignature(prev) === liveWordsSignature(nextWords)) {
          return prev;
        }
        return nextWords;
      });
      setLiveWordMaps((prev) => {
        if (!shouldReplaceLiveWordMaps(prev, maps)) {
          return prev;
        }
        if (liveWordMapsSignature(prev) === liveWordMapsSignature(maps)) {
          return prev;
        }
        return maps;
      });
    };

    const unsubMaps = subscribeSessionWordMaps(gameId, (event) => {
      if (cancelled) {
        return;
      }
      if (event.type === 'unavailable') {
        // permission_denied / error ≠ authoritative empty — keep waiting for
        // snapshot/fetch so results cannot freeze «0 слів» forever (C1/I4).
        return;
      }
      if (event.type !== 'snapshot') {
        return;
      }
      heardListener = true;
      applyMaps(event.maps);
      markBootstrapComplete();
    });

    if (
      shouldCompleteWordsBootstrapWithoutFetch({
        enabled,
        hasGameId: true,
        rosterLength: rosterPlayerIds.length,
      })
    ) {
      // Empty roster: listen only (no blocking fetch). Do not tear down on later roster growth —
      // subscription deps are [enabled, gameId] only.
      markBootstrapComplete();
      return () => {
        cancelled = true;
        unsubMaps();
      };
    }

    void tryFetchSessionWordMaps(gameId).then((result) => {
      if (cancelled || heardListener) {
        return;
      }
      if (!result.ok) {
        if (__DEV__) {
          console.warn('tryFetchSessionWordMaps', result.error);
        }
        // Wait for listener snapshot — do not complete on fetch fail or invent
        // empty maps (avoids freezing empty results).
        return;
      }
      applyMaps(result.maps);
      markBootstrapComplete();
    });

    return () => {
      cancelled = true;
      unsubMaps();
    };
    // rosterPlayerIds only gates bootstrap fetch; invert is full maps — do not resubscribe on roster churn
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: enabled + gameId only
  }, [enabled, gameId]);

  return { liveWords, liveWordMaps, wordsBootstrapComplete };
}
