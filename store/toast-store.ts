import { create } from 'zustand';
import type { PlayToastEnqueueInput } from '@/hooks/useToastQueue';

export interface ToastState {
  pendingToasts: PlayToastEnqueueInput[];
  enqueueToast: (message: string, variant?: 'default' | 'success' | 'warning') => void;
  consumeToasts: () => PlayToastEnqueueInput[];
}

export const useToastStore = create<ToastState>((set, get) => ({
  pendingToasts: [],
  enqueueToast: (message, variant = 'default') => {
    set((state) => ({
      pendingToasts: [...state.pendingToasts, { message, variant }],
    }));
  },
  consumeToasts: () => {
    const toasts = get().pendingToasts;
    if (toasts.length > 0) {
      set({ pendingToasts: [] });
    }
    return toasts;
  },
}));
