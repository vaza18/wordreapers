import { useCallback, useEffect, useState } from 'react';

import { getHasCompletedTrainingRound } from '@/lib/onboarding/training-milestone';

export interface TrainingMilestoneState {
  hydrated: boolean;
  hasCompletedTrainingRound: boolean;
  refresh: () => void;
}

/**
 * Hydrates local training milestone from AsyncStorage (device-only gate for multiplayer).
 */
export function useTrainingMilestone(): TrainingMilestoneState {
  const [state, setState] = useState<Omit<TrainingMilestoneState, 'refresh'>>({
    hydrated: false,
    hasCompletedTrainingRound: false,
  });

  const refresh = useCallback(() => {
    void getHasCompletedTrainingRound().then((hasCompletedTrainingRound) => {
      setState((prev) => ({ ...prev, hydrated: true, hasCompletedTrainingRound }));
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
