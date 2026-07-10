import type { GameSession, GameSessionPlayer } from '../../firebase/types.js';

import { liveParticipantOpponentIds } from './live-round-membership.js';

/**
 * Player is currently in the live room (`online: true`).
 * Background / screen-off sets `online: false` without `hasLeft` — treat like left for
 * solo-vs-vote UI (pause / end / add-time), not as a presence-lag connected peer.
 */
export function isPlayerConnectedInSession(player: GameSessionPlayer | undefined): boolean {
  if (!player) {
    return false;
  }
  if (player.hasLeft === true && player.online !== true) {
    return false;
  }
  return player.online === true;
}

/**
 * At least one other live-round participant remains (roster / scores), even if offline.
 */
export function hasActiveOpponent(session: GameSession, myUid: string): boolean {
  return liveParticipantOpponentIds(session, myUid).length > 0;
}

/**
 * At least one other live-round participant is currently online (`online: true`).
 * Used for solo menu labels and immediate pause/finish/add-time (no vote).
 */
export function hasOnlineOpponent(session: GameSession, myUid: string): boolean {
  return onlineActiveOpponentIds(session, myUid).length > 0;
}

/** Other live-round participants currently online. */
export function onlineActiveOpponentIds(session: GameSession, myUid: string): string[] {
  return liveParticipantOpponentIds(session, myUid).filter((id) =>
    isPlayerConnectedInSession(session.players[id]),
  );
}

export function onlineActiveOpponentNames(session: GameSession, myUid: string): string[] {
  return onlineActiveOpponentIds(session, myUid).map((id) => session.players[id]?.name ?? id);
}
