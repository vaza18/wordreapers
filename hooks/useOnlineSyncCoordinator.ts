import { usePathname, useGlobalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import { resolveActiveOnlineGameIdForSync } from '@/lib/online/parse-active-online-game-id';
import { listPendingRoundArchives } from '@/lib/online/session/pending-round-archive';
import { listFinishedRoundArchives } from '@/lib/online/session/online-session-archive';
import { syncFinishedRoundsCoordinator } from '@/lib/online/sync-coordinator';
import { useFirebaseStore } from '@/store/firebase-store';

const DEBOUNCE_MS = 400;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/** Run archive backfill when pending or recent online rounds exist. */
async function runSync(
  pathname: string,
  uid: string | null,
  routeGameId?: string | null,
): Promise<void> {
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

  await syncFinishedRoundsCoordinator({
    uid: uid ?? undefined,
    activeOnlineGameId: resolveActiveOnlineGameIdForSync(pathname, routeGameId),
  });
}

/**
 * Debounced sync on app foreground and route changes (except live online screen context).
 */
export function useOnlineSyncCoordinator(enabled: boolean): void {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ gameId?: string | string[] }>();
  const routeGameId = firstParam(params.gameId) ?? null;
  const uid = useFirebaseStore((state) => state.uid);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameRef = useRef(pathname);
  const routeGameIdRef = useRef(routeGameId);
  pathnameRef.current = pathname;
  routeGameIdRef.current = routeGameId;

  const scheduleSync = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSync(pathnameRef.current, uid, routeGameIdRef.current);
    }, DEBOUNCE_MS);
  }, [enabled, uid]);

  useEffect(() => {
    scheduleSync();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [scheduleSync, pathname, routeGameId]);

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
