/**
 * Serializes per-player presence writes so a newer offline intent cancels an
 * in-flight online write (and vice versa). Prevents background → offline being
 * overwritten by a stale markPlayerOnline / reconcile that started earlier.
 */

export type PresenceIntent = 'online' | 'offline';

type PresenceWriteState = {
  intent: PresenceIntent;
  generation: number;
};

const latestByPlayer = new Map<string, PresenceWriteState>();

function playerKey(gameId: string, uid: string): string {
  return `${gameId}:${uid}`;
}

/**
 * Stable API object with methods inlined on the object.
 * Named export bindings + Metro HMR previously left callers with
 * `undefined is not a function` / `Property 'beginPresenceWrite' doesn't exist`.
 */
export const presenceWriteQueue = {
  begin(gameId: string, uid: string, intent: PresenceIntent): number {
    const key = playerKey(gameId, uid);
    const generation = (latestByPlayer.get(key)?.generation ?? 0) + 1;
    latestByPlayer.set(key, { intent, generation });
    return generation;
  },

  isCurrent(gameId: string, uid: string, generation: number, intent: PresenceIntent): boolean {
    const current = latestByPlayer.get(playerKey(gameId, uid));
    return current?.generation === generation && current.intent === intent;
  },

  latestIntent(gameId: string, uid: string): PresenceIntent | null {
    return latestByPlayer.get(playerKey(gameId, uid))?.intent ?? null;
  },

  resetForTests(): void {
    latestByPlayer.clear();
  },
};

/** Begin a presence write; returns a generation that must still match before committing. */
export function beginPresenceWrite(gameId: string, uid: string, intent: PresenceIntent): number {
  return presenceWriteQueue.begin(gameId, uid, intent);
}

/** True when this write is still the latest intent for the player. */
export function isPresenceWriteCurrent(
  gameId: string,
  uid: string,
  generation: number,
  intent: PresenceIntent,
): boolean {
  return presenceWriteQueue.isCurrent(gameId, uid, generation, intent);
}

/** Latest intent for this player, if any write has started. */
export function latestPresenceIntent(gameId: string, uid: string): PresenceIntent | null {
  return presenceWriteQueue.latestIntent(gameId, uid);
}

/** Test helper — clear queue state between cases. */
export function resetPresenceWriteQueueForTests(): void {
  presenceWriteQueue.resetForTests();
}
