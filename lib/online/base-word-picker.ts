import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

/** True when the player may pick the base word this round (online, still in roster). */
export function isEligibleBaseWordPickerPlayer(player: GameSessionPlayer | undefined): boolean {
  if (!player || player.hasLeft === true) {
    return false;
  }
  return player.online === true;
}

/**
 * Join order for rotating who picks the base word each round (organizer maintains queue).
 * Appends roster players missing from stored order (legacy sessions).
 */
export function baseWordPickerOrder(session: GameSession): string[] {
  const stored = session.baseWordPickerOrder ?? [];
  const order = stored.length > 0 ? [...stored] : [session.organizerId];
  for (const uid of Object.keys(session.players)) {
    if (!order.includes(uid)) {
      order.push(uid);
    }
  }
  return order;
}

/**
 * Active picker uid for the current lobby round (skips offline / left players).
 */
export function currentBaseWordPickerUid(session: GameSession): string {
  const order = baseWordPickerOrder(session);
  const round = session.baseWordRound ?? 0;
  const startIndex = order.length > 0 ? round % order.length : 0;

  for (let offset = 0; offset < order.length; offset += 1) {
    const uid = order[(startIndex + offset) % order.length];
    if (uid && isEligibleBaseWordPickerPlayer(session.players[uid])) {
      return uid;
    }
  }

  for (const uid of order) {
    if (isEligibleBaseWordPickerPlayer(session.players[uid])) {
      return uid;
    }
  }

  return session.organizerId;
}

export function isCurrentBaseWordPicker(session: GameSession, uid: string): boolean {
  return currentBaseWordPickerUid(session) === uid;
}

/** True when `actorUid` may transition a waiting lobby to `playing`. */
export function canActorStartWaitingRound(session: GameSession, actorUid: string): boolean {
  if (session.status !== 'waiting') {
    return false;
  }
  if (!session.baseWord || session.baseWord.length < 2) {
    return false;
  }
  return currentBaseWordPickerUid(session) === actorUid;
}

/** 1-based turn label for UI. */
export function baseWordPickerTurnNumber(session: GameSession): number {
  return (session.baseWordRound ?? 0) + 1;
}
