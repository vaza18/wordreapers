import { useEffect, useRef } from 'react';
import type { TFunction } from 'i18next';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ensureAnonymousAuth } from '@/lib/firebase/auth';
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

type UsePlaySessionSubscriptionsParams = {
  gameId: string;
  myUid: string;
  t: TFunction;
  /** Bumped with `beginPlayMapsRoundReset` on play round clear. */
  mapsGateRef: RefObject<PlayMapsListenerGate>;
  /** Incremented on round clear so this hook force-syncs maps from RTDB. */
  mapsResetNonce: number;
  setSessionCore: Dispatch<SetStateAction<GameSessionSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
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
  setSessionCore,
  setLoading,
  setLoadError,
  setWordMaps,
  setMyWords,
}: UsePlaySessionSubscriptionsParams): void {
  const roomNotFoundMessage = t('online.errorRoomNotFound');
  const mapsSnapshotRef = useRef<SessionWordMaps | null>(null);
  const myWordsRef = useRef<Set<string>>(new Set());
  const liveStatusRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!gameId || !myUid) {
      return undefined;
    }
    let cancelled = false;
    let unsubSession: (() => void) | undefined;
    let unsubMaps: (() => void) | undefined;

    void ensureAnonymousAuth().then(() => {
      if (cancelled) {
        return;
      }
      unsubSession = subscribeGameSession(gameId, (next) => {
        liveStatusRef.current = next?.status ?? null;
        setSessionCore((prev) => mergePlaySessionSubscription(prev, next));
        setLoading(false);
        setLoadError((prevError) => nextPlaySessionLoadError(prevError, next, roomNotFoundMessage));
      });
      unsubMaps = subscribeSessionWordMaps(gameId, (event) => {
        const callbackEpoch = mapsGateRef.current.epoch;
        queueMicrotask(() => {
          if (cancelled) {
            return;
          }
          const source = event.type === 'unavailable' ? 'unavailable' : 'snapshot';
          const decided = decidePlayMapsListenerApply({
            gate: mapsGateRef.current,
            callbackEpoch,
            previous: mapsSnapshotRef.current,
            next: event.type === 'snapshot' ? event.maps : mapsSnapshotRef.current,
            source,
          });
          commitMapsRef.current({
            decided,
            allowEmptyClear: decided.apply && isEmptyPlayMaps(decided.maps),
          });
        });
      });
    });

    return () => {
      cancelled = true;
      unsubSession?.();
      unsubMaps?.();
    };
  }, [
    gameId,
    mapsGateRef,
    myUid,
    roomNotFoundMessage,
    setLoadError,
    setLoading,
    setMyWords,
    setSessionCore,
    setWordMaps,
  ]);

  // After local round reset: force-sync RTDB maps (may already be empty with no new onValue).
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
