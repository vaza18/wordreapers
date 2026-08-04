import { useCallback, useEffect, useRef, useState } from 'react';

import {
  subscribeSessionWordMaps,
  tryFetchSessionWordMaps,
  ROSTER_WORD_MAPS_SEED_GET_MAX_ATTEMPTS,
} from '@/lib/firebase/session-word-maps-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { wordsByPlayerFromWordPlayers } from '@/lib/online/word-players-invert';
import type { AllPlayerWords } from '@/lib/online/session/clone-player-words';
import {
  liveWordMapsSignature,
  liveWordsSignature,
  shouldReplaceLiveWordMaps,
  totalPlayerWordCount,
  wordPlayersLeafCount,
} from '@/lib/online/session/live-words-snapshot';
import { shouldPreserveRosterMapsOnUnavailableRemount } from '@/lib/online/session/roster-maps-unavailable-remount';
import { shouldCompleteWordsBootstrapWithoutFetch } from '@/lib/online/session/words-bootstrap-gate';

const EMPTY_WORDS: AllPlayerWords = new Map();

/** One automatic resubscribe after seed abandon / PD before fail-loud CTA. */
export const ROSTER_MAPS_UNAVAILABLE_RETRY_MS = 400;

/**
 * Absolute hung-cap for empty authoritative + in-flight bootstrap fetch.
 * Must **not** complete empty bootstrap (that closes rematch-survival and cancels
 * late rich fetch). Fail-loud via {@link mapsUnavailable} CTA while listen/fetch stay alive.
 */
export const ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS = 30_000;

/**
 * Second listen epoch uses a single seed get so hung-get CTA is not another full
 * multi-attempt budget on top of {@link ROSTER_WORD_MAPS_SEED_GET_MAX_ATTEMPTS}.
 */
export const ROSTER_WORD_MAPS_SEED_RETRY_MAX_ATTEMPTS = 1;

type UseLiveRosterPlayerWordsParams = {
  gameId: string;
  /** Used only for bootstrap fetch gate (empty roster = listen-only). */
  rosterPlayerIds: string[];
  enabled: boolean;
};

type PreservedRosterMaps = {
  maps: SessionWordMaps | null;
  words: AllPlayerWords;
};

/**
 * Fetch + subscribe to session word maps once; invert to per-player word lists.
 * **Ignores `seed: 'provisional'`** (same as play) so escape/spinner cannot paint
 * partial lists as final results. First authoritative listen or non-empty fetch
 * applies as open SoT; later deltas stay membership grow-only.
 * Empty fetch waits for authoritative listen; non-empty fetch is atomic SoT.
 * After seed `unavailable`: one delayed resubscribe, then `mapsUnavailable` for CTA.
 * Post-bootstrap unavailable also remounts once (preserve SoT) then CTA — left live lists.
 * {@link retryMapsListen} remounts subscribe after fail-loud (manual retry).
 */
export function useLiveRosterPlayerWords({
  gameId,
  rosterPlayerIds,
  enabled,
}: UseLiveRosterPlayerWordsParams): {
  liveWords: AllPlayerWords;
  liveWordMaps: SessionWordMaps | null;
  wordsBootstrapComplete: boolean;
  mapsUnavailable: boolean;
  retryMapsListen: () => void;
} {
  const [liveWords, setLiveWords] = useState(EMPTY_WORDS);
  const [liveWordMaps, setLiveWordMaps] = useState<SessionWordMaps | null>(null);
  const [wordsBootstrapComplete, setWordsBootstrapComplete] = useState(false);
  const [mapsUnavailable, setMapsUnavailable] = useState(false);
  const [listenEpoch, setListenEpoch] = useState(0);
  /** Bumped by manual retry so a remount runs even when listenEpoch is already 0. */
  const [listenRemountNonce, setListenRemountNonce] = useState(0);
  /** Preserve SoT across post-bootstrap maps remount (do not wipe finished/left lists). */
  const remountPreserveRef = useRef<PreservedRosterMaps | null>(null);
  /**
   * Hung-cap CTA while bootstrap fetch still in flight — Retry must not remount/cancel
   * that fetch (would drop late rich wipe-race survival). Keep CTA+Home until settle;
   * kick a parallel tryFetch (rich-only) so Retry is not a no-op.
   */
  const hungCapAwaitingFetchRef = useRef(false);
  /** Kick another bootstrap fetch without tearing down listen / primary in-flight get. */
  const kickBootstrapFetchRef = useRef<(() => void) | null>(null);

  const liveWordsRef = useRef(liveWords);
  const liveWordMapsRef = useRef(liveWordMaps);
  liveWordsRef.current = liveWords;
  liveWordMapsRef.current = liveWordMaps;

  useEffect(() => {
    setListenEpoch(0);
    setListenRemountNonce(0);
    remountPreserveRef.current = null;
    hungCapAwaitingFetchRef.current = false;
    kickBootstrapFetchRef.current = null;
  }, [gameId]);

  const retryMapsListen = useCallback(() => {
    // I4 + C1: hung-cap — do not remount (late rich) and do not dismiss CTA (no naked
    // survival spinner without Home). Kick another tryFetch; primary stays alive.
    if (hungCapAwaitingFetchRef.current) {
      kickBootstrapFetchRef.current?.();
      return;
    }
    // Preserve SoT across manual Retry after post-bootstrap fail-loud (no empty flash).
    const maps = liveWordMapsRef.current;
    const words = liveWordsRef.current;
    const preserving =
      wordPlayersLeafCount(maps?.wordPlayers) > 0 || totalPlayerWordCount(words) > 0;
    if (preserving) {
      remountPreserveRef.current = { maps, words };
      // Keep bootstrap complete so results/left do not flash ActivityIndicator between
      // mapsUnavailable=false and the remount effect restore (post-paint Retry).
      setWordsBootstrapComplete(true);
    } else {
      setWordsBootstrapComplete(false);
    }
    setMapsUnavailable(false);
    setListenEpoch(0);
    setListenRemountNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !gameId) {
      // Keep last non-empty words on disable (rematch may clear roster before freeze).
      // Drop only when leaving the room entirely so empty-clear guards stay room-local.
      // Do NOT mark bootstrap complete here — stale-true freezes empty results (C1).
      if (!gameId) {
        setLiveWords(EMPTY_WORDS);
        setLiveWordMaps(null);
        setWordsBootstrapComplete(false);
        setMapsUnavailable(false);
      }
      return undefined;
    }

    const preserved = remountPreserveRef.current;
    remountPreserveRef.current = null;

    let cancelled = false;
    /** Authoritative listen heard (empty or rich). */
    let heardAuthoritative = Boolean(preserved);
    /** Bootstrap fetch settled (ok or fail). */
    let fetchSettled = false;
    /** First authoritative/fetch already applied as open SoT; later events are grow-only. */
    let appliedAuthoritativeSource = Boolean(preserved);
    let bootstrapComplete = Boolean(preserved);
    let lastAppliedMaps: SessionWordMaps | null = preserved?.maps ?? null;
    let lastAppliedWords: AllPlayerWords = preserved?.words ?? EMPTY_WORDS;
    let unavailableRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let emptyListenFetchHungTimer: ReturnType<typeof setTimeout> | null = null;

    if (preserved) {
      setLiveWords(preserved.words);
      setLiveWordMaps(preserved.maps);
      setWordsBootstrapComplete(true);
      setMapsUnavailable(false);
    } else {
      // Fresh subscribe: clear before listen so richness-guard is room-local.
      setLiveWords(EMPTY_WORDS);
      setLiveWordMaps(null);
      setWordsBootstrapComplete(false);
      setMapsUnavailable(false);
      hungCapAwaitingFetchRef.current = false;
    }

    const markBootstrapComplete = () => {
      if (cancelled || bootstrapComplete) {
        return;
      }
      bootstrapComplete = true;
      hungCapAwaitingFetchRef.current = false;
      if (emptyListenFetchHungTimer != null) {
        clearTimeout(emptyListenFetchHungTimer);
        emptyListenFetchHungTimer = null;
      }
      setWordsBootstrapComplete(true);
      setMapsUnavailable(false);
    };

    const scheduleEmptyListenFetchHungCap = () => {
      if (cancelled || bootstrapComplete || emptyListenFetchHungTimer != null) {
        return;
      }
      emptyListenFetchHungTimer = setTimeout(() => {
        emptyListenFetchHungTimer = null;
        // Hung fetch: fail-loud CTA — do NOT markBootstrapComplete (survival close +
        // enabled=false would cancel in-flight late rich). Keep listen/fetch alive.
        if (!fetchSettled && !bootstrapComplete && !cancelled) {
          hungCapAwaitingFetchRef.current = true;
          setMapsUnavailable(true);
        }
      }, ROSTER_EMPTY_LISTEN_FETCH_HUNG_MS);
    };

    const applyMaps = (
      maps: SessionWordMaps | null,
      options?: { fromAuthoritativeSource?: boolean },
    ) => {
      const fromAuthoritativeSource = options?.fromAuthoritativeSource === true;
      // First authoritative/fetch is SoT over provisional peak; later deltas grow-only.
      // Non-empty fetch over empty listen uses open when previous leaves are 0 (wipe race).
      const previousLeaves = wordPlayersLeafCount(lastAppliedMaps?.wordPlayers);
      const mode =
        fromAuthoritativeSource && (!appliedAuthoritativeSource || previousLeaves === 0)
          ? { mode: 'open' as const }
          : { mode: 'grow-only' as const };
      if (!shouldReplaceLiveWordMaps(lastAppliedMaps, maps, mode)) {
        if (fromAuthoritativeSource) {
          appliedAuthoritativeSource = true;
        }
        return;
      }
      // Atomic: words always invert from the accepted maps snapshot (I5).
      const nextWords = wordsByPlayerFromWordPlayers(maps?.wordPlayers);
      if (liveWordMapsSignature(lastAppliedMaps) !== liveWordMapsSignature(maps)) {
        setLiveWordMaps(maps);
      }
      if (liveWordsSignature(lastAppliedWords) !== liveWordsSignature(nextWords)) {
        setLiveWords(nextWords);
      }
      lastAppliedMaps = maps;
      lastAppliedWords = nextWords;
      if (fromAuthoritativeSource) {
        appliedAuthoritativeSource = true;
      }
    };

    const unsubMaps = subscribeSessionWordMaps(
      gameId,
      (event) => {
        if (cancelled) {
          return;
        }
        if (event.type === 'unavailable') {
          // Not authoritative empty — do not complete bootstrap / freeze «0 слів».
          // Post-bootstrap / rich SoT: remount once (preserve) then fail-loud.
          // Incomplete empty listen: remount WITHOUT preserve + restart fetch (C1 wipe-race).
          if (heardAuthoritative || bootstrapComplete) {
            if (listenEpoch === 0) {
              if (unavailableRetryTimer != null) {
                return;
              }
              unavailableRetryTimer = setTimeout(() => {
                unavailableRetryTimer = null;
                if (cancelled) {
                  return;
                }
                if (
                  shouldPreserveRosterMapsOnUnavailableRemount({
                    bootstrapComplete,
                    maps: lastAppliedMaps,
                    words: lastAppliedWords,
                  })
                ) {
                  remountPreserveRef.current = {
                    maps: lastAppliedMaps,
                    words: lastAppliedWords,
                  };
                } else {
                  remountPreserveRef.current = null;
                }
                setListenEpoch(1);
              }, ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
              return;
            }
            setMapsUnavailable(true);
            // Keep bootstrap incomplete: defense for freeze/pending/latch paths that
            // still gate on wordsBootstrapComplete. Canonical rematch-survival close
            // guard is mapsUnavailable in shouldCloseResultsRematchSurvival — do not
            // remove this flip until those paths no longer depend on incomplete bootstrap.
            // Keep last words in state — screen shows Retry over them until remount.
            bootstrapComplete = false;
            setWordsBootstrapComplete(false);
            return;
          }
          // Pre-bootstrap: one automatic resubscribe, then fail-loud CTA.
          if (listenEpoch === 0) {
            if (unavailableRetryTimer != null) {
              return;
            }
            unavailableRetryTimer = setTimeout(() => {
              unavailableRetryTimer = null;
              if (cancelled || heardAuthoritative || bootstrapComplete) {
                return;
              }
              setListenEpoch(1);
            }, ROSTER_MAPS_UNAVAILABLE_RETRY_MS);
            return;
          }
          setMapsUnavailable(true);
          bootstrapComplete = false;
          setWordsBootstrapComplete(false);
          return;
        }
        if (event.type !== 'snapshot') {
          return;
        }
        if (event.seed !== 'authoritative') {
          // Provisional: ignore on results (ADR-022) — never paint partial lists.
          return;
        }
        applyMaps(event.maps, { fromAuthoritativeSource: true });
        heardAuthoritative = true;
        if (wordPlayersLeafCount(event.maps.wordPlayers) > 0) {
          markBootstrapComplete();
          return;
        }
        // Empty listen: wait for in-flight fetch. Never complete empty while
        // fetchSettled===false except absolute hung-cap → mapsUnavailable CTA.
        if (fetchSettled) {
          markBootstrapComplete();
        } else {
          scheduleEmptyListenFetchHungCap();
        }
      },
      {
        seedGetMaxAttempts:
          listenEpoch === 0
            ? ROSTER_WORD_MAPS_SEED_GET_MAX_ATTEMPTS
            : ROSTER_WORD_MAPS_SEED_RETRY_MAX_ATTEMPTS,
      },
    );

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
        if (unavailableRetryTimer != null) {
          clearTimeout(unavailableRetryTimer);
        }
        if (emptyListenFetchHungTimer != null) {
          clearTimeout(emptyListenFetchHungTimer);
        }
        unsubMaps();
      };
    }

    // Post-bootstrap remount already has SoT — skip duplicate bootstrap fetch.
    if (!preserved) {
      const applyBootstrapFetchResult = (
        result: Awaited<ReturnType<typeof tryFetchSessionWordMaps>>,
        options?: { richOnly?: boolean },
      ) => {
        if (cancelled || bootstrapComplete) {
          return;
        }
        const richOnly = options?.richOnly === true;
        if (!result.ok) {
          if (__DEV__) {
            console.warn('tryFetchSessionWordMaps', result.error);
          }
          if (richOnly) {
            // Hung-cap kick failed — keep CTA; primary in-flight may still win.
            return;
          }
          fetchSettled = true;
          hungCapAwaitingFetchRef.current = false;
          if (emptyListenFetchHungTimer != null) {
            clearTimeout(emptyListenFetchHungTimer);
            emptyListenFetchHungTimer = null;
          }
          // Listen may still deliver; if empty listen already waiting, complete now.
          if (heardAuthoritative) {
            markBootstrapComplete();
          }
          return;
        }
        const fetchLeaves = wordPlayersLeafCount(result.maps.wordPlayers);
        if (fetchLeaves > 0) {
          // Late rich fetch over empty authoritative listen (C1 wipe race). Skip if listen
          // already delivered rich SoT (do not swap stale snapshot over live rich).
          if (wordPlayersLeafCount(lastAppliedMaps?.wordPlayers) === 0) {
            applyMaps(result.maps, { fromAuthoritativeSource: true });
          }
          heardAuthoritative = true;
          fetchSettled = true;
          hungCapAwaitingFetchRef.current = false;
          if (emptyListenFetchHungTimer != null) {
            clearTimeout(emptyListenFetchHungTimer);
            emptyListenFetchHungTimer = null;
          }
          markBootstrapComplete();
          return;
        }
        if (richOnly) {
          // Empty kick must not close hung-cap / survival while primary may still return rich.
          return;
        }
        fetchSettled = true;
        hungCapAwaitingFetchRef.current = false;
        if (emptyListenFetchHungTimer != null) {
          clearTimeout(emptyListenFetchHungTimer);
          emptyListenFetchHungTimer = null;
        }
        // Empty fetch: do not complete bootstrap alone while listen can still deliver rich.
        if (!heardAuthoritative) {
          applyMaps(result.maps);
          return;
        }
        markBootstrapComplete();
      };

      let kickInFlight = false;
      kickBootstrapFetchRef.current = () => {
        // I4: single-flight kick — spam Retry must not pile parallel tryFetch.
        if (kickInFlight || cancelled || bootstrapComplete) {
          return;
        }
        kickInFlight = true;
        void tryFetchSessionWordMaps(gameId).then((result) => {
          kickInFlight = false;
          applyBootstrapFetchResult(result, { richOnly: true });
        });
      };

      void tryFetchSessionWordMaps(gameId).then((result) => {
        applyBootstrapFetchResult(result);
      });
    }

    return () => {
      cancelled = true;
      kickBootstrapFetchRef.current = null;
      if (unavailableRetryTimer != null) {
        clearTimeout(unavailableRetryTimer);
      }
      if (emptyListenFetchHungTimer != null) {
        clearTimeout(emptyListenFetchHungTimer);
      }
      unsubMaps();
    };
    // rosterPlayerIds only gates bootstrap fetch; invert is full maps — do not resubscribe on roster churn.
    // listenEpoch = auto retry after unavailable; listenRemountNonce = manual retryMapsListen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: enabled + gameId + listenEpoch + listenRemountNonce
  }, [enabled, gameId, listenEpoch, listenRemountNonce]);

  return {
    liveWords,
    liveWordMaps,
    wordsBootstrapComplete,
    mapsUnavailable,
    retryMapsListen,
  };
}
