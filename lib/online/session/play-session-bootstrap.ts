import type { GameSessionSnapshot } from '../../firebase/game-session-service.js';

let pendingBootstrap: GameSessionSnapshot | null = null;
let lastClaimedPlayRouteKey: string | null = null;

/** Stable key for one navigation to play per live round start. */
export function playRouteNavigationKey(
  gameId: string,
  session: Pick<GameSessionSnapshot, 'baseWordRound' | 'timerEndsAt'>,
): string {
  return `${gameId}:${session.baseWordRound ?? 0}:${session.timerEndsAt ?? 0}`;
}

/**
 * First caller wins navigation to play for a given round (prevents lobby hook + handleStart double replace).
 */
export function claimPlayRouteNavigation(
  gameId: string,
  session: Pick<GameSessionSnapshot, 'baseWordRound' | 'timerEndsAt'>,
): boolean {
  const key = playRouteNavigationKey(gameId, session);
  if (lastClaimedPlayRouteKey === key) {
    return false;
  }
  lastClaimedPlayRouteKey = key;
  return true;
}

/** Test reset for navigation claim state. */
export function resetPlayRouteNavigationClaims(): void {
  lastClaimedPlayRouteKey = null;
  pendingBootstrap = null;
}

/** Pass fresh playing snapshot into play screen before navigation (avoids loading flash). */
export function seedPlaySessionBootstrap(session: GameSessionSnapshot): void {
  pendingBootstrap = session;
}

/** One-shot read of seeded snapshot for the target room. */
export function consumePlaySessionBootstrap(gameId: string): GameSessionSnapshot | null {
  if (!pendingBootstrap || pendingBootstrap.id !== gameId) {
    return null;
  }
  const session = pendingBootstrap;
  pendingBootstrap = null;
  return session;
}

/**
 * Ignore stale RTDB cache that still shows `waiting` after we already have a live round.
 */
export function mergePlaySessionSubscription(
  prev: GameSessionSnapshot | null,
  next: GameSessionSnapshot | null,
): GameSessionSnapshot | null {
  if (!next) {
    return null;
  }
  if (!prev) {
    return next;
  }
  const prevRoundLive = prev.status === 'playing' || prev.timerEndsAt != null;
  const nextLooksWaiting = next.status === 'waiting' && next.timerEndsAt == null;
  if (prevRoundLive && nextLooksWaiting) {
    return prev;
  }
  return next;
}
