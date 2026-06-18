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
