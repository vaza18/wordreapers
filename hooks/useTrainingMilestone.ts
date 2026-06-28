import { useEffect, useState } from 'react';

import { getHasCompletedTrainingRound } from '@/lib/onboarding/training-milestone';

export interface TrainingMilestoneState {
  hydrated: boolean;
  hasCompletedTrainingRound: boolean;
}

/**
 * Hydrates local training milestone from AsyncStorage (device-only gate for multiplayer).
 */
export function useTrainingMilestone(): TrainingMilestoneState {
  const [state, setState] = useState<TrainingMilestoneState>({
    hydrated: false,
    hasCompletedTrainingRound: false,
  });

  useEffect(() => {
    let cancelled = false;
    void getHasCompletedTrainingRound().then((hasCompletedTrainingRound) => {
      if (!cancelled) {
        setState({ hydrated: true, hasCompletedTrainingRound });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
