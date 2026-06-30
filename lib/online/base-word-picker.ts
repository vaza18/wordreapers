import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

import { isRematchWaitingLobby } from './rematch-waiting-lobby.js';

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

function rosterPlayersStillInGame(session: GameSession): string[] {
  return baseWordPickerOrder(session).filter(
    (uid) => session.players[uid] && session.players[uid].hasLeft !== true,
  );
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

  const remaining = rosterPlayersStillInGame(session);
  return remaining[0] ?? session.organizerId;
}

function pickFromCandidates(session: GameSession, round: number, candidates: string[]): string {
  if (candidates.length === 0) {
    const remaining = rosterPlayersStillInGame(session);
    return remaining[0] ?? session.organizerId;
  }
  if (candidates.length === 1) {
    return candidates[0] ?? session.organizerId;
  }

  const previousPicker = scheduledBaseWordPickerUid(session, round - 1);
  const withoutPrevious = candidates.filter((uid) => uid !== previousPicker);
  const pool = withoutPrevious.length > 0 ? withoutPrevious : candidates;

  const order = baseWordPickerOrder(session);
  const startIndex = ((round % order.length) + order.length) % order.length;
  for (let offset = 0; offset < order.length; offset += 1) {
    const uid = order[(startIndex + offset) % order.length];
    if (uid && pool.includes(uid)) {
      return uid;
    }
  }

  return pool[0] ?? session.organizerId;
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
  if (eligible.length >= 2) {
    return pickFromCandidates(session, round, eligible);
  }
  if (eligible.length === 1) {
    const remaining = rosterPlayersStillInGame(session);
    if (remaining.length >= 2 && !isRematchWaitingLobby(session)) {
      return pickFromCandidates(session, round, remaining);
    }
    return eligible[0] ?? session.organizerId;
  }

  if (isRematchWaitingLobby(session)) {
    return session.organizerId;
  }

  return pickFromCandidates(session, round, rosterPlayersStillInGame(session));
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
