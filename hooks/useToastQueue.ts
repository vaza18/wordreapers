import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { applyToastWallClock } from '@/lib/online/play-toast-wall-clock';
import type { PlayToastVariant } from '@/lib/online/play-toast-display';

export const PLAY_TOAST_VISIBLE_MS = 3800;
export const PLAY_TOAST_FADE_OUT_MS = 400;
export const PLAY_TOAST_FADE_START_MS = PLAY_TOAST_VISIBLE_MS - PLAY_TOAST_FADE_OUT_MS;
/** Wall-clock prune while toasts are visible (survives frozen setTimeout when AppState inactive). */
export const PLAY_TOAST_PRUNE_INTERVAL_MS = 250;

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
  /** Wall-clock expiry — prune even if JS timers were frozen while inactive. */
  expiresAt: number;
}

function toastListChanged(prev: readonly PlayToastItem[], next: readonly PlayToastItem[]): boolean {
  if (prev.length !== next.length) {
    return true;
  }
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i]!;
    const b = next[i]!;
    if (a.id !== b.id || a.fading !== b.fading) {
      return true;
    }
  }
  return false;
}

/**
 * Short-lived toast queue with fade-out timing shared by play and results screens.
 * Wall-clock `expiresAt` + prune interval so inactive AppState cannot freeze dismiss forever.
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

  const pruneByWallClock = useCallback((now = Date.now()) => {
    setToasts((current) => {
      const next = applyToastWallClock(current, now, PLAY_TOAST_FADE_OUT_MS);
      if (!toastListChanged(current, next)) {
        return current;
      }
      const kept = new Set(next.map((toast) => toast.id));
      for (const id of timersRef.current.keys()) {
        if (!kept.has(id)) {
          clearTimers(id);
        }
      }
      return next;
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    clearTimers(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const enqueueToasts = useCallback(
    (items: readonly PlayToastEnqueueInput[]) => {
      if (items.length === 0) {
        return;
      }

      const enqueuedAt = Date.now();
      const newItems: PlayToastItem[] = items.map(({ message, variant = 'default' }) => ({
        id: String(++nextIdRef.current),
        message,
        variant,
        fading: false,
        expiresAt: enqueuedAt + PLAY_TOAST_VISIBLE_MS,
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

  useEffect(() => {
    if (toasts.length === 0) {
      return undefined;
    }
    const id = setInterval(() => {
      pruneByWallClock();
    }, PLAY_TOAST_PRUNE_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, [pruneByWallClock, toasts.length]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        pruneByWallClock();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
    };
  }, [pruneByWallClock]);

  useEffect(
    () => () => {
      for (const id of [...timersRef.current.keys()]) {
        clearTimers(id);
      }
    },
    [],
  );

  return { toasts, enqueueToasts };
}
