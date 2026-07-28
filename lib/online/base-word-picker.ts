import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

import { assertBaseWordPickerEligibility } from './invariants.js';

import { isRematchWaitingLobby } from './rematch/rematch-waiting-lobby.js';

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
 * Session-aware eligibility for who may hold the base-word picker seat.
 * Requires `online === true` (and not `hasLeft`). Durable rematch latch still keeps
 * an offline player **visible** in the lobby list, but peers must not wait on a
 * backgrounded / lock-screen / force-quit picker. Lobby and pick-word use
 * `background-only` offline policy, so `online: false` means real background or disconnect
 * — not multi-sim `inactive`.
 */
export function isEligibleBaseWordPickerInSession(session: GameSession, uid: string): boolean {
  return isEligibleBaseWordPickerPlayer(session.players[uid]);
}

/**
 * Join order for rotating who picks the base word each round (organizer maintains queue).
 * Appends roster players missing from stored order (legacy sessions).
 */
export function baseWordPickerOrder(session: GameSession): string[] {
  const stored = session.baseWordPickerOrder ?? [];
  const order = stored.length > 0 ? [...stored] : [session.organizerId];
  const seen = new Set(order);
  for (const uid of Object.keys(session.players)) {
    if (!seen.has(uid)) {
      seen.add(uid);
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
 * Whether lobby sync should wipe a committed base word.
 * A chosen word must **not** disappear when the picker seat moves (rightful joiner,
 * offline transfer, leave). The new picker keeps it and may change it or start.
 * Only clear when the chooser uid is missing from the roster (corrupt/orphan).
 */
export function shouldClearLobbyBaseWordForPicker(session: GameSession): boolean {
  const word = session.baseWord;
  const chosenBy = session.baseWordChosenBy;
  if (!word || word.length < 2 || !chosenBy) {
    return false;
  }
  return session.players[chosenBy] == null;
}

/**
 * Active picker uid for the current lobby round.
 * Round 1: first eligible in room join order (`baseWordPickerOrder`).
 * Later rounds: walk join order from the round slot among **online** eligible
 * players only — skip anyone offline.
 * Sole first rematcher may pick and start; when the rightful later joiner opts in
 * before start, rotation recalculates and they take the seat — the committed word
 * stays for them to keep, change, or start with.
 * A committed word does not pin the seat to an offline chooser.
 */
export function currentBaseWordPickerUid(session: GameSession): string {
  const round = session.baseWordRound ?? 0;
  const chosenBy = session.baseWordChosenBy;
  const word = session.baseWord;
  const chooser = chosenBy ? session.players[chosenBy] : undefined;
  // Sticky seat only while the chooser is still online and remains rightful.
  const chooserStillInSeat = chooser != null && chooser.hasLeft !== true && chooser.online === true;
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
