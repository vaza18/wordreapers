import { create } from 'zustand';

interface NearbyArchivesState {
  /** Bumped after peer archive import so history screens reload. */
  revision: number;
  bumpRevision: () => void;
}

export const useNearbyArchivesStore = create<NearbyArchivesState>((set) => ({
  revision: 0,
  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
}));
