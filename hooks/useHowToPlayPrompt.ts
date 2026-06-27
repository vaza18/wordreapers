import { useCallback, useEffect, useState } from 'react';

import { getHasSeenHowToPlay, markHowToPlaySeen } from '@/lib/onboarding/how-to-play';

/** Hydrates and controls the first-run how-to-play modal during an active round. */
export function useHowToPlayPrompt(): {
  hydrated: boolean;
  shouldShow: boolean;
  dismiss: () => void;
} {
  const [hydrated, setHydrated] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getHasSeenHowToPlay().then((value) => {
      if (!cancelled) {
        setSeen(value);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setSeen(true);
    void markHowToPlaySeen();
  }, []);

  return {
    hydrated,
    shouldShow: hydrated && !seen,
    dismiss,
  };
}
