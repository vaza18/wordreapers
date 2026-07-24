import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

import { assertBaseWordPickerEligibility } from './invariants.js';

import {
  isRematchDurableLobbyOptIn,
  isRematchWaitingLobby,
  isRematchWaitingLobbyOptedIn,
} from './rematch/rematch-waiting-lobby.js';

/** True when the player may pick the base word this round (online, still in roster). */
export function isEligibleBaseWordPickerPlayer(player: GameSessionPlayer | undefined): boolean {
  if (!player || player.hasLeft === true) {
    return false;
  }
  const eligible = player.online === true;
  if (eligible) {
    assertBaseWordPickerEligibility('picker', player);
  }
  return eligible;
}

/**
 * Session-aware eligibility. Rematch waiting keeps opted-in players (durable
 * `resultsExitedBy` latch / committed base word) even when AppState briefly
 * marks them `online: false`, so the next «Грати ще» cannot steal the picker seat.
 * Stale `hasLeft` does not drop durable rematch seats (latch / pickerUid / word).
 */
export function isEligibleBaseWordPickerInSession(session: GameSession, uid: string): boolean {
  const player = session.players[uid];
  if (isEligibleBaseWordPickerPlayer(player)) {
    return true;
  }
  if (!player || !isRematchWaitingLobby(session)) {
    return false;
  }
  if (player.hasLeft === true && !isRematchDurableLobbyOptIn(session, uid)) {
    return false;
  }
  return isRematchWaitingLobbyOptedIn(session, uid);
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
    isEligibleBaseWordPickerInSession(session, uid),
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

/**
 * Walk room join order from the round slot; first eligible / opted-in wins.
 * Skips players who have not joined this rematch round yet.
 */
function firstEligibleFromRotation(session: GameSession, startRound: number): string {
  const order = baseWordPickerOrder(session);
  if (order.length === 0) {
    return session.organizerId;
  }
  const startIndex = ((startRound % order.length) + order.length) % order.length;

  for (let offset = 0; offset < order.length; offset += 1) {
    const uid = order[(startIndex + offset) % order.length];
    if (uid && isEligibleBaseWordPickerInSession(session, uid)) {
      return uid;
    }
  }

  for (const uid of order) {
    if (isEligibleBaseWordPickerInSession(session, uid)) {
      return uid;
    }
  }

  const remaining = rosterPlayersStillInGame(session);
  return remaining[0] ?? session.organizerId;
}

/** Treat `uid` as rematch-opted-in for rightful-picker checks (chosenBy sticky). */
function sessionWithForcedRematchOptIn(session: GameSession, uid: string): GameSession {
  return {
    ...session,
    resultsExitedBy: {
      ...(session.resultsExitedBy ?? {}),
      [uid]: true,
    },
  };
}

/**
 * Clear a committed lobby word only when another opted-in player is the rightful
 * picker for this round. Never clear when the chooser remains rightful — even if
 * they are briefly `online: false` without a latch (multi-sim AppState race).
 */
export function shouldClearLobbyBaseWordForPicker(session: GameSession): boolean {
  const word = session.baseWord;
  const chosenBy = session.baseWordChosenBy;
  if (!word || word.length < 2 || !chosenBy) {
    return false;
  }
  const chooser = session.players[chosenBy];
  if (!chooser) {
    return true;
  }
  // True leave without rematch latch — clear. Stale hasLeft while still latched must
  // not wipe their word when a late joiner comes online (chosenBy+word alone is not
  // enough here: every committed chooser would look "durable").
  if (chooser.hasLeft === true && session.resultsExitedBy?.[chosenBy] !== true) {
    return true;
  }
  const round = session.baseWordRound ?? 0;
  const rightful = firstEligibleFromRotation(
    sessionWithForcedRematchOptIn(session, chosenBy),
    round,
  );
  return rightful !== chosenBy;
}

/**
 * Active picker uid for the current lobby round.
 * Round 1: first eligible in room join order (`baseWordPickerOrder`).
 * Later rounds: walk join order from the round slot among **opted-in / eligible**
 * players only — skip anyone who has not joined this rematch round yet.
 * Sole first rematcher may pick and start; when the rightful later joiner opts in
 * before start, rotation recalculates and they take the seat (word from a
 * non-current picker is cleared by `syncLobbyPickerState`).
 * A committed word by the still-rightful chooser sticks across brief offline.
 */
export function currentBaseWordPickerUid(session: GameSession): string {
  const round = session.baseWordRound ?? 0;
  const chosenBy = session.baseWordChosenBy;
  const word = session.baseWord;
  const chooser = chosenBy ? session.players[chosenBy] : undefined;
  const chooserStillInSeat =
    chooser != null && (chooser.hasLeft !== true || isRematchDurableLobbyOptIn(session, chosenBy!));
  if (
    isRematchWaitingLobby(session) &&
    chosenBy &&
    typeof word === 'string' &&
    word.length >= 2 &&
    chooserStillInSeat
  ) {
    const rightful = firstEligibleFromRotation(
      sessionWithForcedRematchOptIn(session, chosenBy),
      round,
    );
    if (rightful === chosenBy) {
      return chosenBy;
    }
  }
  return firstEligibleFromRotation(session, round);
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
