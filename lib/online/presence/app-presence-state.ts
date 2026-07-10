import type { AppStateStatus } from 'react-native';

/** App left the foreground (home screen, screen off, another app) — mark RTDB offline. */
export function shouldMarkPresenceOffline(nextState: AppStateStatus): boolean {
  return nextState === 'background';
}

/**
 * App is in the foreground (`active`).
 * Used for: mark online, RTDB reconnect, and auto-rejoin / presence reconcile.
 * Must not run those while backgrounded — intentional offline looks like a desync in RTDB.
 */
export function shouldMarkPresenceOnline(nextState: AppStateStatus): boolean {
  return nextState === 'active';
}
