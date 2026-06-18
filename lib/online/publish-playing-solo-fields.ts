import type { GameSession } from '../firebase/types.js';

/** Timer fields for publishing a solo round (active or paused). */
export function buildPlayingSoloTimerFields(
  remainingMs: number,
  paused: boolean,
  serverNow: number,
): Pick<GameSession, 'timerEndsAt' | 'pauseState'> {
  const frozenRemainingMs = Math.max(0, remainingMs);
  if (paused) {
    return {
      timerEndsAt: null,
      pauseState: {
        active: true,
        frozenRemainingMs,
        frozenAt: serverNow,
      },
    };
  }
  return {
    timerEndsAt: serverNow + frozenRemainingMs,
    pauseState: null,
  };
}
