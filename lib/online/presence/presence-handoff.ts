// INVARIANT (see docs/known-issues.md — 2026-07 Presence handoff): in-room screen transitions must not mark offline on unmount.
/** Game id whose presence hook unmount should not mark the player offline (screen-to-screen). */
let handoffGameId: string | null = null;

/** Call before navigating to another online screen in the same room. */
export function handoffPlayerPresence(gameId: string): void {
  handoffGameId = gameId;
}

/** True when another online screen claimed presence for this room. */
export function consumePresenceHandoff(gameId: string): boolean {
  if (handoffGameId !== gameId) {
    return false;
  }
  handoffGameId = null;
  return true;
}

/** Test reset. */
export function resetPresenceHandoff(): void {
  handoffGameId = null;
}
