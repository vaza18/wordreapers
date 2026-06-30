import { useCallback, useEffect, useRef, useState } from 'react';

export const PLAY_TOAST_VISIBLE_MS = 3800;
export const PLAY_TOAST_FADE_OUT_MS = 400;
export const PLAY_TOAST_FADE_START_MS = PLAY_TOAST_VISIBLE_MS - PLAY_TOAST_FADE_OUT_MS;

import type { PlayToastVariant } from '@/lib/online/play-toast-display';

export type { PlayToastVariant } from '@/lib/online/play-toast-display';

export interface PlayToastEnqueueInput {
  message: string;
  variant?: PlayToastVariant;
}

export interface PlayToastItem {
  id: string;
  message: string;
  variant: PlayToastVariant;
  fading: boolean;
}

/**
 * Short-lived toast queue with fade-out timing shared by play and results screens.
 */
export function useToastQueue(): {
  toasts: PlayToastItem[];
  enqueueToasts: (items: readonly PlayToastEnqueueInput[]) => void;
} {
  const [toasts, setToasts] = useState<PlayToastItem[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  const clearTimers = (id: string) => {
    const timers = timersRef.current.get(id);
    if (!timers) {
      return;
    }
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timersRef.current.delete(id);
  };

  const removeToast = useCallback((id: string) => {
    clearTimers(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const enqueueToasts = useCallback(
    (items: readonly PlayToastEnqueueInput[]) => {
      if (items.length === 0) {
        return;
      }

      const newItems: PlayToastItem[] = items.map(({ message, variant = 'default' }) => ({
        id: String(++nextIdRef.current),
        message,
        variant,
        fading: false,
      }));

      setToasts((current) => [...current, ...newItems]);

      for (const item of newItems) {
        const fadeTimer = setTimeout(() => {
          setToasts((current) =>
            current.map((toast) => (toast.id === item.id ? { ...toast, fading: true } : toast)),
          );
        }, PLAY_TOAST_FADE_START_MS);

        const removeTimer = setTimeout(() => {
          removeToast(item.id);
        }, PLAY_TOAST_VISIBLE_MS);

        timersRef.current.set(item.id, [fadeTimer, removeTimer]);
      }
    },
    [removeToast],
  );

  useEffect(
    () => () => {
      for (const id of timersRef.current.keys()) {
        clearTimers(id);
      }
    },
    [],
  );

  return { toasts, enqueueToasts };
}
