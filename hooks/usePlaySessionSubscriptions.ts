import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import {
  markPlayerOnline,
  tryReadGameSessionSnapshot,
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import {
  tryFetchSessionWordMaps,
  clearSessionWordMaps,
  subscribeSessionWordMaps,
} from '@/lib/firebase/session-word-maps-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { shouldHealPlayUiOnAppState } from '@/lib/game/compose-resume-heal';
import { shouldMarkPresenceOnline } from '@/lib/online/presence/app-presence-state';
import { mergePlaySessionSubscription } from '@/lib/online/session/play-session-bootstrap';
import { nextPlaySessionLoadError } from '@/lib/online/session/play-session-load-error';
import {
  commitPlayMapsApply,
  decidePlayMapsForceSync,
  decidePlayMapsForceSyncExhaustion,
  decidePlayMapsListenerApply,
  decidePlayMapsPlayingRichRecovery,
  isEmptyPlayMaps,
  PLAY_MAPS_EXHAUSTION_WIPE_RETRY_MS,
  PLAY_MAPS_PLAYING_RICH_RECOVERY_MS,
  type PlayMapsListenerGate,
} from '@/lib/online/session/play-word-maps-apply';
import { devLogAction } from '@/lib/debug/dev-log';

/** Wait for rematch wipe before treating rich fetch as stuck (I2). */
const MAPS_RESET_RETRY_MS = 500;
/** Attempts after round reset: 0..MAX inclusive ⇒ up to MAX+1 fetches. */
const MAPS_RESET_MAX_ATTEMPT = 4;

/** Delay before remounting maps subscribe after seed abandon / PD (C2). */
export const PLAY_MAPS_UNAVAILABLE_RETRY_MS = 400;
/**
 * Fast remounts before fail-loud banner (then **stop** until Retry nonce).
 * Worst-case hung seed before banner ≈
 * `(MAX_RESUBSCRIBES + 1) × seedGetMaxAttempts × WORD_MAPS_SEED_GET_TIMEOUT_MS`
 * (~3 epochs × 3 soft ticks × 8s ≈ ~72s) — **product signed-off** SLA
 * (late-seal > shorter CTA; do not shorten without product ask).
 * Do not “fix” by eager supersede / parallel get on soft-timeout.
 */
export const PLAY_MAPS_UNAVAILABLE_MAX_RESUBSCRIBES = 2;
/**
 * Play `seedGetMaxAttempts` (dual: max real gets + soft ticks per hung get).
 * Forever-hung get#1 → unavailable after 3×8s with **one** Firebase get — not 3 gets.
 */
export const PLAY_WORD_MAPS_SEED_GET_MAX_ATTEMPTS = 3;

type UsePlaySessionSubscriptionsParams = {
  gameId: string;
  myUid: string;
  t: TFunction;
  /** Bumped with `beginPlayMapsRoundReset` on play round clear. */
  mapsGateRef: RefObject<PlayMapsListenerGate>;
  /** Incremented on round clear so this hook force-syncs maps from RTDB. */
  mapsResetNonce: number;
  /** Bumped by play UI retry after maps sync fail-loud. */
  mapsRetryNonce?: number;
  setSessionCore: Dispatch<SetStateAction<GameSessionSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  /**
   * Separate from {@link setLoadError}: session snapshots must not clear maps
   * fail-loud (nextPlaySessionLoadError returns null whenever session exists).
   */
  setMapsSyncFailed: Dispatch<SetStateAction<boolean>>;
  setWordMaps: Dispatch<SetStateAction<SessionWordMaps | null>>;
  setMyWords: Dispatch<SetStateAction<Set<string>>>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** RTDB session + word maps; own words derived from wordPlayers for this uid. */
export function usePlaySessionSubscriptions({
  gameId,
  myUid,
  t,
  mapsGateRef,
  mapsResetNonce,
  mapsRetryNonce = 0,
  setSessionCore,
  setLoading,
  setLoadError,
  setMapsSyncFailed,
  setWordMaps,
  setMyWords,
}: UsePlaySessionSubscriptionsParams): void {
  const roomNotFoundMessage = t('online.errorRoomNotFound');
  const mapsSnapshotRef = useRef<SessionWordMaps | null>(null);
  const myWordsRef = useRef<Set<string>>(new Set());
  const liveStatusRef = useRef<string | null>(null);
  /** Remount maps subscribe after seed abandon so live deltas are not dead forever (C2). */
  const [mapsListenEpoch, setMapsListenEpoch] = useState(0);
  /**
   * Bumped with Retry / gameId so remount runs even when epoch is already 0.
   * Reset of epoch happens in useLayoutEffect (before maps subscribe effect),
   * so the maps subscribe never mounts with a stale exhausted epoch (Retry race).
   */
  const [mapsRemountNonce, setMapsRemountNonce] = useState(0);
  const mapsSyncFailedRef = useRef(false);
  const mapsRetryResetKeyRef = useRef({ gameId, mapsRetryNonce });

  // Atomic Retry/gameId reset in layout (before maps subscribe effect) so the maps
  // effect never mounts with a stale exhausted epoch. Ref-first avoids Strict Mode
  // double-bump of remount nonce.
  // Retry must **not** clear mapsSyncFailed here — keep banner until authoritative
  // seed (roster hung-cap parity). Only gameId change clears fail-loud for a new room.
  useLayoutEffect(() => {
    if (
      mapsRetryResetKeyRef.current.gameId === gameId &&
      mapsRetryResetKeyRef.current.mapsRetryNonce === mapsRetryNonce
    ) {
      return;
    }
    const gameChanged = mapsRetryResetKeyRef.current.gameId !== gameId;
    mapsRetryResetKeyRef.current = { gameId, mapsRetryNonce };
    setMapsListenEpoch(0);
    setMapsRemountNonce((n) => n + 1);
    if (gameChanged) {
      mapsSyncFailedRef.current = false;
      setMapsSyncFailed(false);
    }
  }, [gameId, mapsRetryNonce, setMapsSyncFailed]);

  type CommitMapsFn = (options: {
    decided: ReturnType<typeof decidePlayMapsListenerApply>;
    allowEmptyClear: boolean;
  }) => void;
  const commitMapsRef = useRef<CommitMapsFn>(() => undefined);
  commitMapsRef.current = (options) => {
    const committed = commitPlayMapsApply({
      decided: options.decided,
      previousOwn: myWordsRef.current,
      myUid,
      allowEmptyClear: options.allowEmptyClear,
    });
    if (!committed.applied) {
      return;
    }
    mapsGateRef.current = committed.gate;
    mapsSnapshotRef.current = committed.maps;
    myWordsRef.current = committed.ownWords;
    setWordMaps(committed.maps);
    setMyWords(committed.ownWords);
  };

  // Session listen — independent of maps remount epoch (I1).
  // Never leave ensureAnonymousAuth().then without reject handler (C1): maps already
  // fail-loud via subscribeSessionWordMaps; session must not stick on eternal loading.
  useEffect(() => {
    if (!gameId || !myUid) {
      return undefined;
    }
    let cancelled = false;
    let unsubSession: (() => void) | undefined;

    void ensureAnonymousAuth().then(
      () => {
        if (cancelled) {
          return;
        }
        unsubSession = subscribeGameSession(gameId, (next) => {
          liveStatusRef.current = next?.status ?? null;
          setSessionCore((prev) => mergePlaySessionSubscription(prev, next));
          setLoading(false);
          setLoadError((prevError) =>
            nextPlaySessionLoadError(prevError, next, roomNotFoundMessage),
          );
        });
      },
      (error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoading(false);
        setLoadError(joinErrorMessage(error, t));
      },
    );

    return () => {
      cancelled = true;
      unsubSession?.();
    };
    // `t` omitted: harness/play pass inline t; listing it remounts session forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [gameId, myUid, roomNotFoundMessage, setLoadError, setLoading, setSessionCore]);

  // Maps listen — remounts on mapsListenEpoch without tearing down session (C2 / I1).
  // Auth is gated inside subscribeSessionWordMaps (emit unavailable on reject) — do not
  // wrap with outer ensureAnonymousAuth().then without .catch (silent empty maps).
  useEffect(() => {
    if (!gameId || !myUid) {
      return undefined;
    }
    let cancelled = false;
    let unavailableRetryTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubMaps = subscribeSessionWordMaps(
      gameId,
      (event) => {
        const callbackEpoch = mapsGateRef.current.epoch;
        queueMicrotask(() => {
          if (cancelled) {
            return;
          }
          const source = event.type === 'unavailable' ? 'unavailable' : 'snapshot';
          if (event.type === 'snapshot' && event.seed === 'authoritative') {
            if (mapsSyncFailedRef.current) {
              mapsSyncFailedRef.current = false;
              setMapsSyncFailed(false);
            }
          }
          if (event.type === 'unavailable') {
            // Keep last maps; remount even after authoritative seed — mid-round cancel
            // otherwise leaves dead children with no live deltas (I1).
            // Past MAX: fail-loud banner once; stop auto-remount (permanent PD must not
            // spin get+onChild* every 5s). Retry (mapsRetryNonce) resets epoch.
            if (unavailableRetryTimer == null) {
              const exhausted = mapsListenEpoch >= PLAY_MAPS_UNAVAILABLE_MAX_RESUBSCRIBES;
              if (exhausted) {
                if (!mapsSyncFailedRef.current) {
                  mapsSyncFailedRef.current = true;
                  setMapsSyncFailed(true);
                }
              } else {
                unavailableRetryTimer = setTimeout(() => {
                  unavailableRetryTimer = null;
                  if (cancelled) {
                    return;
                  }
                  const status = liveStatusRef.current;
                  if (status != null && status !== 'playing' && status !== 'waiting') {
                    // Remount forbidden off live statuses — fail-loud, not silent dead listen.
                    if (!mapsSyncFailedRef.current) {
                      mapsSyncFailedRef.current = true;
                      setMapsSyncFailed(true);
                    }
                    return;
                  }
                  setMapsListenEpoch((epoch) => epoch + 1);
                }, PLAY_MAPS_UNAVAILABLE_RETRY_MS);
              }
            }
          }
          const decided = decidePlayMapsListenerApply({
            gate: mapsGateRef.current,
            callbackEpoch,
            previous: mapsSnapshotRef.current,
            next: event.type === 'snapshot' ? event.maps : mapsSnapshotRef.current,
            source,
            seed: event.type === 'snapshot' ? event.seed : undefined,
          });
          commitMapsRef.current({
            decided,
            allowEmptyClear: decided.apply && isEmptyPlayMaps(decided.maps),
          });
        });
      },
      { seedGetMaxAttempts: PLAY_WORD_MAPS_SEED_GET_MAX_ATTEMPTS, localUid: myUid },
    );

    return () => {
      cancelled = true;
      if (unavailableRetryTimer != null) {
        clearTimeout(unavailableRetryTimer);
      }
      unsubMaps?.();
    };
  }, [
    gameId,
    mapsGateRef,
    mapsListenEpoch,
    mapsRemountNonce,
    myUid,
    setMapsSyncFailed,
    setMyWords,
    setWordMaps,
  ]);

  // After local round reset: force-sync RTDB maps (may already be empty with no new seed/onChild*).
  useEffect(() => {
    if (!gameId || !myUid || mapsResetNonce <= 0) {
      return undefined;
    }
    let cancelled = false;
    const syncEpoch = mapsGateRef.current.epoch;
    mapsSnapshotRef.current = null;
    myWordsRef.current = new Set();

    const applyExhaustionAndRecover = async () => {
      const exhaustedAt = Date.now();
      const exhausted = decidePlayMapsForceSyncExhaustion({
        gate: mapsGateRef.current,
        syncEpoch,
        previous: mapsSnapshotRef.current,
      });
      commitMapsRef.current({
        decided: exhausted,
        allowEmptyClear: exhausted.apply,
      });
      if (!exhausted.apply || cancelled) {
        return;
      }
      devLogAction('play maps force-sync exhausted; retrying wipe', {
        level: 'detail',
        room: gameId,
      });
      // Best-effort: succeeds only while status is waiting/finished (rules).
      await clearSessionWordMaps(gameId);
      await delay(PLAY_MAPS_EXHAUSTION_WIPE_RETRY_MS);
      if (cancelled || syncEpoch !== mapsGateRef.current.epoch) {
        return;
      }
      if (!mapsGateRef.current.awaitingEmptySync) {
        return;
      }
      const retry = await tryFetchSessionWordMaps(gameId);
      if (cancelled) {
        return;
      }
      if (retry.ok) {
        const wipe = decidePlayMapsForceSync({
          gate: mapsGateRef.current,
          syncEpoch,
          next: retry.maps,
          previous: mapsSnapshotRef.current,
        });
        if (wipe.apply) {
          commitMapsRef.current({ decided: wipe, allowEmptyClear: true });
          return;
        }
      }
      // Under playing, wipe cannot run; empty may never arrive once peers submit.
      // Safe only because startGameSession verifies wipe before waiting→playing.
      const remaining = Math.max(
        0,
        PLAY_MAPS_PLAYING_RICH_RECOVERY_MS - (Date.now() - exhaustedAt),
      );
      await delay(remaining);
      if (cancelled || syncEpoch !== mapsGateRef.current.epoch) {
        return;
      }
      if (!mapsGateRef.current.awaitingEmptySync) {
        return;
      }
      const recoveryFetch = await tryFetchSessionWordMaps(gameId);
      if (cancelled || !recoveryFetch.ok) {
        return;
      }
      const recovered = decidePlayMapsPlayingRichRecovery({
        gate: mapsGateRef.current,
        syncEpoch,
        next: recoveryFetch.maps,
        previous: mapsSnapshotRef.current,
        liveStatus: liveStatusRef.current,
        exhaustedForMs: Date.now() - exhaustedAt,
      });
      if (recovered.apply) {
        devLogAction('play maps playing rich recovery after exhaustion', {
          level: 'detail',
          room: gameId,
        });
        commitMapsRef.current({
          decided: recovered,
          allowEmptyClear: isEmptyPlayMaps(recovered.maps),
        });
      }
    };

    const runSync = async (attempt: number) => {
      const result = await tryFetchSessionWordMaps(gameId);
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        devLogAction('tryFetchSessionWordMaps after round maps reset failed', {
          level: 'detail',
          room: gameId,
          details: result.error instanceof Error ? result.error.message : String(result.error),
        });
        if (attempt < MAPS_RESET_MAX_ATTEMPT) {
          await delay(MAPS_RESET_RETRY_MS);
          if (!cancelled) {
            await runSync(attempt + 1);
          }
          return;
        }
        await applyExhaustionAndRecover();
        return;
      }
      const decided = decidePlayMapsForceSync({
        gate: mapsGateRef.current,
        syncEpoch,
        next: result.maps,
        previous: mapsSnapshotRef.current,
      });
      if (!decided.apply) {
        if (attempt < MAPS_RESET_MAX_ATTEMPT) {
          await delay(MAPS_RESET_RETRY_MS);
          if (!cancelled) {
            await runSync(attempt + 1);
          }
          return;
        }
        await applyExhaustionAndRecover();
        return;
      }
      commitMapsRef.current({ decided, allowEmptyClear: true });
    };

    void runSync(0);
    return () => {
      cancelled = true;
    };
  }, [gameId, mapsGateRef, mapsResetNonce, myUid, setMyWords, setWordMaps]);

  // After unlock: refresh presence + heal own words from maps if listener stalled.
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
          devLogAction('markPlayerOnline on AppState active failed', {
            level: 'detail',
            room: gameId,
            details: error instanceof Error ? error.message : String(error),
          });
        }
        if (!shouldMarkPresenceOnline(AppState.currentState)) {
          return;
        }
        const [snap, mapsResult] = await Promise.all([
          tryReadGameSessionSnapshot(gameId).catch((error: unknown) => {
            devLogAction('tryReadGameSessionSnapshot on AppState active failed', {
              level: 'detail',
              room: gameId,
              details: error instanceof Error ? error.message : String(error),
            });
            return null;
          }),
          tryFetchSessionWordMaps(gameId),
        ]);
        if (snap) {
          setSessionCore((prev) => mergePlaySessionSubscription(prev, snap));
        }
        if (!mapsResult.ok) {
          devLogAction('tryFetchSessionWordMaps on AppState active failed', {
            level: 'detail',
            room: gameId,
            details:
              mapsResult.error instanceof Error
                ? mapsResult.error.message
                : String(mapsResult.error),
          });
          return;
        }
        const callbackEpoch = mapsGateRef.current.epoch;
        const decided = decidePlayMapsListenerApply({
          gate: mapsGateRef.current,
          callbackEpoch,
          previous: mapsSnapshotRef.current,
          next: mapsResult.maps,
          source: 'snapshot',
        });
        commitMapsRef.current({
          decided,
          allowEmptyClear: decided.apply && isEmptyPlayMaps(decided.maps),
        });
      })();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
    };
  }, [gameId, mapsGateRef, myUid, setMyWords, setSessionCore, setWordMaps]);
}
