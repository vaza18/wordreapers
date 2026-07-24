import type { PresenceOfflinePolicy } from './app-presence-state.js';

/**
 * Lobby screen presence offline policy — always `background-only`.
 *
 * Do **not** switch to `background-and-inactive` when RTDB flips `waiting → playing`
 * while this screen is still mounted. That policy change remounts
 * `usePlayerOnlinePresence` (deps include `offlinePolicy`); cleanup runs **without**
 * a play handoff yet and writes `online: false`, so both clients log
 * «rejoined room (was offline)» immediately after start (WAGTJ).
 *
 * Play owns lock-screen `inactive→offline` after lobby navigates with handoff.
 * Session status is intentionally ignored — lobby policy must stay stable.
 */
export function lobbyPresenceOfflinePolicy(): PresenceOfflinePolicy {
  return 'background-only';
}
