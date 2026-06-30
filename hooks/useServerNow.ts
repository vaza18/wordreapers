import { useEffect, useState } from 'react';

import { getServerNow } from '@/lib/firebase/server-clock';

/**
 * Ticking clock based on Firebase `.info/serverTimeOffset` (same remaining time on all devices).
 */
export function useServerNow(tickMs = 250): number {
  const [now, setNow] = useState(() => getServerNow());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(getServerNow());
    }, tickMs);
    return () => {
      clearInterval(id);
    };
  }, [tickMs]);

  return now;
}

/**
 * Tick only while `enabled` — avoids re-rendering idle screens every 250ms.
 * When disabled, returns a fresh `getServerNow()` snapshot without scheduling.
 */
export function useServerNowWhen(enabled: boolean, tickMs = 250): number {
  const [now, setNow] = useState(() => getServerNow());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const id = setInterval(() => {
      setNow(getServerNow());
    }, tickMs);
    return () => {
      clearInterval(id);
    };
  }, [enabled, tickMs]);

  return enabled ? now : getServerNow();
}
