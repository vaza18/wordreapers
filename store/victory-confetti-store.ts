import { create } from 'zustand';

export interface VictoryConfettiState {
  /** Incremented on each celebration so the host can replay the burst. */
  burstId: number;
  celebrate: () => void;
}

/**
 * Global trigger for the victory confetti burst. Kept in a store so the burst
 * can be rendered by a root-level host that paints above the navigation header.
 */
export const useVictoryConfettiStore = create<VictoryConfettiState>((set) => ({
  burstId: 0,
  celebrate: () => {
    set((state) => ({ burstId: state.burstId + 1 }));
  },
}));
