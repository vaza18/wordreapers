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

/** Uids currently in the lobby and eligible to pick (online, not left). */
export function eligibleBaseWordPickerUids(session: GameSession): string[] {
  return baseWordPickerOrder(session).filter((uid) =>
    isEligibleBaseWordPickerPlayer(session.players[uid]),
  );
}

/** Static rotation slot for a round index (ignores who is online in the lobby). */
export function scheduledBaseWordPickerUid(session: GameSession, round: number): string {
  const order = baseWordPickerOrder(session);
  if (order.length === 0) {
    return session.organizerId;
  }
  const index = ((round % order.length) + order.length) % order.length;
  return order[index] ?? session.organizerId;
}

function firstEligibleFromRotation(session: GameSession, startRound: number): string {
  const order = baseWordPickerOrder(session);
  if (order.length === 0) {
    return session.organizerId;
  }
  const startIndex = ((startRound % order.length) + order.length) % order.length;

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

/**
 * Active picker uid for the current lobby round.
 * Round 1: first eligible in join order.
 * Later rounds: another eligible player when 2+ are present; repeat only when alone.
 */
export function currentBaseWordPickerUid(session: GameSession): string {
  const round = session.baseWordRound ?? 0;
  if (round === 0) {
    return firstEligibleFromRotation(session, 0);
  }

  const eligible = eligibleBaseWordPickerUids(session);
  if (eligible.length <= 1) {
    return eligible[0] ?? session.organizerId;
  }

  const previousPicker = scheduledBaseWordPickerUid(session, round - 1);
  const candidateSet = new Set(eligible.filter((uid) => uid !== previousPicker));
  if (candidateSet.size === 0) {
    return eligible[0] ?? session.organizerId;
  }

  const order = baseWordPickerOrder(session);
  const startIndex = ((round % order.length) + order.length) % order.length;
  for (let offset = 0; offset < order.length; offset += 1) {
    const uid = order[(startIndex + offset) % order.length];
    if (uid && candidateSet.has(uid)) {
      return uid;
    }
  }

  return eligible[0] ?? session.organizerId;
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
