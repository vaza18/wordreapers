/**
 * Runtime invariant checks for online multiplayer state transitions.
 * Throws only in dev and test — production logs are avoided to prevent user-facing crashes.
 */

import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

export function shouldAssertOnlineInvariants(): boolean {
  return (typeof __DEV__ !== 'undefined' && __DEV__ === true) || process.env.NODE_ENV === 'test';
}

function invariantFailure(message: string): void {
  if (!shouldAssertOnlineInvariants()) {
    return;
  }
  throw new Error(`[online-invariant] ${message}`);
}

/** Non-opt-in rematch waiting players stay in roster with offline presence, not marked left. */
export function assertRematchWaitingPlayerPatch(
  playerId: string,
  optedIn: boolean,
  patch: Pick<GameSessionPlayer, 'online' | 'hasLeft'>,
): void {
  if (patch.hasLeft === true) {
    invariantFailure(`rematch waiting patch for ${playerId}: hasLeft must be false (got true)`);
  }
  if (optedIn && patch.online !== true) {
    invariantFailure(`rematch waiting patch for ${playerId}: opted-in player must be online`);
  }
  if (!optedIn && patch.online !== false) {
    invariantFailure(`rematch waiting patch for ${playerId}: non-opt-in player must be offline`);
  }
}

/** Rematch bootstrap must not carry finished-round coordination fields into waiting. */
export function assertRematchBootstrapSessionShape(session: GameSession): void {
  if (session.status !== 'waiting') {
    invariantFailure(`rematch bootstrap session must be waiting (got ${session.status})`);
  }
  if (session.resultsExitedBy != null) {
    invariantFailure('rematch bootstrap session must clear resultsExitedBy');
  }
  if (session.wordPlayers != null) {
    invariantFailure('rematch bootstrap session must not include wordPlayers');
  }
  if (session.purgeAfterAt != null) {
    invariantFailure('rematch bootstrap session must not include purgeAfterAt');
  }
}

/** Voluntarily left players must not appear in rematch waiting lobby visibility. */
export function assertLobbyVisiblePlayerState(
  uid: string,
  player: GameSessionPlayer | undefined,
  visible: boolean,
): void {
  if (player?.hasLeft === true && visible) {
    invariantFailure(`lobby visibility for ${uid}: hasLeft players must not be visible`);
  }
}
