import { create } from 'zustand';

import { isFirebaseConfigured } from '@/lib/firebase/config';
import type { FirebaseConnectionStatus } from '@/lib/firebase/connection';

export interface FirebaseState {
  status: FirebaseConnectionStatus;
  uid: string | null;
  errorMessage: string | null;
  setConnection: (payload: {
    status: FirebaseConnectionStatus;
    uid?: string | null;
    errorMessage?: string | null;
  }) => void;
}

export const useFirebaseStore = create<FirebaseState>((set) => ({
  status: isFirebaseConfigured() ? 'idle' : 'not_configured',
  uid: null,
  errorMessage: null,

  setConnection: ({ status, uid = null, errorMessage = null }) => {
    set({ status, uid, errorMessage });
  },
}));
