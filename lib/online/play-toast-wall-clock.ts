import type { PlayToastVariant } from './play-toast-display.js';

/** Must stay in sync with `PLAY_TOAST_FADE_OUT_MS` in `hooks/useToastQueue.ts`. */
export const PLAY_TOAST_WALL_CLOCK_FADE_MS = 400;

export type WallClockToast = {
  id: string;
  message: string;
  variant: PlayToastVariant;
  fading: boolean;
  expiresAt: number;
};

/** Apply fade / drop based on wall clock (survives frozen JS timers). */
export function applyToastWallClock<T extends WallClockToast>(
  toasts: readonly T[],
  now: number,
  fadeMs: number = PLAY_TOAST_WALL_CLOCK_FADE_MS,
): T[] {
  const next: T[] = [];
  for (const toast of toasts) {
    if (toast.expiresAt <= now) {
      continue;
    }
    const shouldFade = toast.expiresAt - now <= fadeMs;
    if (shouldFade && !toast.fading) {
      next.push({ ...toast, fading: true });
    } else {
      next.push(toast);
    }
  }
  return next;
}
