import type { AppStateStatus } from 'react-native';

/**
 * How AppState maps to RTDB `players/{uid}.online` while a presence hook is mounted.
 *
 * - `background-and-inactive` — play / live round: iOS lock often stays `inactive`
 *   without `background`, and open votes must not wait forever on a locked peer.
 * - `background-only` — rematch / first-round waiting lobby: multi-sim focus and
 *   Control Center flip the unfocused simulator to `inactive` while the player is
 *   still in the lobby UI; treating that as offline shows a false «📵» and makes
 *   peers think the picker never chose a word.
 */
export type PresenceOfflinePolicy = 'background-and-inactive' | 'background-only';

/**
 * App left interactive foreground — mark RTDB offline (no `hasLeft`).
 * Policy controls whether iOS `inactive` counts (see `PresenceOfflinePolicy`).
 * Training auto-pause stays `background`-only (see `auto-pause-on-app-state`).
 */
export function shouldMarkPresenceOffline(
  nextState: AppStateStatus,
  policy: PresenceOfflinePolicy = 'background-and-inactive',
): boolean {
  if (nextState === 'background') {
    return true;
  }
  if (nextState === 'inactive') {
    return policy === 'background-and-inactive';
  }
  return false;
}

/**
 * App is in the foreground (`active`).
 * Used for: mark online, RTDB reconnect, and auto-rejoin / presence reconcile.
 * Must not run those while backgrounded or inactive — intentional offline looks like a desync in RTDB.
 */
export function shouldMarkPresenceOnline(nextState: AppStateStatus): boolean {
  return nextState === 'active';
}
