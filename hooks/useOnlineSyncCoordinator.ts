import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import { listPendingRoundArchives } from '@/lib/online/session/pending-round-archive';
import { listFinishedRoundArchives } from '@/lib/online/session/online-session-archive';
import { syncFinishedRoundsCoordinator } from '@/lib/online/sync-coordinator';
import { useFirebaseStore } from '@/store/firebase-store';

const DEBOUNCE_MS = 400;

/** Parse active online play/results route ids from the Expo pathname. */
function parseOnlineRoute(pathname: string): {
  activePlayGameId: string | null;
  activeResultsGameId: string | null;
} {
  const playMatch = pathname.match(/^\/online\/play\/([^/]+)$/);
  if (playMatch) {
    return { activePlayGameId: playMatch[1] ?? null, activeResultsGameId: null };
  }
  const resultsMatch = pathname.match(/^\/online\/results\/([^/]+)$/);
  if (resultsMatch) {
    return { activePlayGameId: null, activeResultsGameId: resultsMatch[1] ?? null };
  }
  return { activePlayGameId: null, activeResultsGameId: null };
}

/** Run archive backfill when pending or recent online rounds exist. */
async function runSync(pathname: string, uid: string | null): Promise<void> {
  const pending = await listPendingRoundArchives();
  const recent = await listFinishedRoundArchives();
  const hasOnlineArchives = recent.some((entry) => entry.session.organizerId !== 'solo');
  if (pending.length === 0 && !hasOnlineArchives) {
    return;
  }

  const firebase = await ensureFirebaseReady();
  const setConnection = useFirebaseStore.getState().setConnection;
  if (firebase) {
    setConnection({
      status: firebase.status,
      uid: firebase.uid ?? null,
      errorMessage: firebase.errorMessage ?? null,
    });
  } else if (pending.length > 0) {
    const probe = await ensureFirebaseReady({ forceRetry: true });
    if (probe) {
      setConnection({
        status: probe.status,
        uid: probe.uid ?? null,
        errorMessage: probe.errorMessage ?? null,
      });
    }
  }

  if (useFirebaseStore.getState().status !== 'ok') {
    return;
  }

  const route = parseOnlineRoute(pathname);
  await syncFinishedRoundsCoordinator({
    uid: uid ?? undefined,
    activePlayGameId: route.activePlayGameId,
    activeResultsGameId: route.activeResultsGameId,
  });
}

/**
 * Debounced sync on app foreground and route changes (except live play screen context).
 */
export function useOnlineSyncCoordinator(enabled: boolean): void {
  const pathname = usePathname();
  const uid = useFirebaseStore((state) => state.uid);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const scheduleSync = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSync(pathnameRef.current, uid);
    }, DEBOUNCE_MS);
  }, [enabled, uid]);

  useEffect(() => {
    scheduleSync();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [scheduleSync]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        scheduleSync();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
    };
  }, [enabled, scheduleSync]);
}

export { runSync as runOnlineSyncNow };
