import { useEffect, useRef } from 'react';

import { playTimerAlert } from '@/lib/feedback/game-feedback';
import type { FeedbackMode } from '@/lib/settings/feedback-mode';

const ALERT_THRESHOLDS = [60, 10, 5, 4, 3, 2, 1] as const;

/**
 * Fires timer alerts at 60s, 10s, and 5–1s remaining; deduped per threshold until time is added back.
 */
export function useTimerAlerts(
  remainingMs: number,
  isPaused: boolean,
  mode: FeedbackMode,
  enabled = true,
): void {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled || remainingMs <= 0) {
      firedRef.current.clear();
    }
  }, [enabled, remainingMs]);

  useEffect(() => {
    if (!enabled || isPaused || remainingMs <= 0) {
      return;
    }

    const secs = Math.ceil(remainingMs / 1000);

    for (const threshold of ALERT_THRESHOLDS) {
      if (secs > threshold) {
        firedRef.current.delete(threshold);
      }
    }

    for (const threshold of ALERT_THRESHOLDS) {
      if (secs === threshold && !firedRef.current.has(threshold)) {
        firedRef.current.add(threshold);
        playTimerAlert(mode);
      }
    }
  }, [enabled, isPaused, mode, remainingMs]);
}
