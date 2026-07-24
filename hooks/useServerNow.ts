import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getServerNow } from '@/lib/firebase/server-clock';
import { shouldHealPlayUiOnAppState } from '@/lib/game/compose-resume-heal';

function subscribeForegroundClockRefresh(onActive: () => void): () => void {
  const onChange = (next: AppStateStatus) => {
    if (shouldHealPlayUiOnAppState(next)) {
      onActive();
    }
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => {
    sub.remove();
  };
}

/**
 * Ticking clock based on Firebase `.info/serverTimeOffset` (same remaining time on all devices).
 * Refreshes immediately on AppState `active` so lock-screen freezes do not leave a stale timer.
 */
export function useServerNow(tickMs = 250): number {
  const [now, setNow] = useState(() => getServerNow());

  useEffect(() => {
    const refresh = () => {
      setNow(getServerNow());
    };
    refresh();
    const id = setInterval(refresh, tickMs);
    const unsubAppState = subscribeForegroundClockRefresh(refresh);
    return () => {
      clearInterval(id);
      unsubAppState();
    };
  }, [tickMs]);

  return now;
}

/**
 * Tick only while `enabled` — avoids re-rendering idle screens every 250ms.
 * When disabled, returns a fresh `getServerNow()` snapshot without scheduling.
 * While enabled, also refreshes on AppState `active` (iOS lock resume).
 */
export function useServerNowWhen(enabled: boolean, tickMs = 250): number {
  const [now, setNow] = useState(() => getServerNow());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const refresh = () => {
      setNow(getServerNow());
    };
    refresh();
    const id = setInterval(refresh, tickMs);
    const unsubAppState = subscribeForegroundClockRefresh(refresh);
    return () => {
      clearInterval(id);
      unsubAppState();
    };
  }, [enabled, tickMs]);

  return enabled ? now : getServerNow();
}
