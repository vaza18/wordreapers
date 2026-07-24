import type { GameSession } from '../../firebase/types.js';
import { assertLobbyVisiblePlayerState } from '../invariants.js';

/** Waiting lobby for round 2+ after a finished session reopens for rematch. */
export function isRematchWaitingLobby(
  session: Pick<GameSession, 'status' | 'baseWordRound'>,
): boolean {
  return session.status === 'waiting' && (session.baseWordRound ?? 0) > 0;
}

/**
 * Durable rematch opt-in latch written into `resultsExitedBy` for the waiting phase.
 * Survives AppState `inactive` → `online: false` so the first rematcher keeps their
 * picker seat / lobby visibility when a peer joins.
 */
export function buildRematchOptInLatch(
  actorUid: string,
  prior?: Record<string, boolean> | null,
): Record<string, boolean> {
  const latch: Record<string, boolean> = { [actorUid]: true };
  if (prior) {
    for (const [uid, exited] of Object.entries(prior)) {
      if (exited === true) {
        latch[uid] = true;
      }
    }
  }
  return latch;
}

/**
 * Durable rematch seat signals (not mere `online`). Survive stale `hasLeft` and
 * multi-sim `online: false` so a late joiner still sees the first rematcher.
 */
export function isRematchDurableLobbyOptIn(
  session: Pick<GameSession, 'resultsExitedBy'> &
    Partial<Pick<GameSession, 'baseWord' | 'baseWordChosenBy' | 'baseWordPickerUid'>>,
  uid: string,
): boolean {
  if (session.resultsExitedBy?.[uid] === true) {
    return true;
  }
  // Rematch writes `baseWordPickerUid` for the sole/first rematcher before a word
  // exists. Multi-sim focus can mark them `online: false` while a late joiner is
  // active — without this seat signal the late joiner thinks they are alone (rule 1)
  // and steals pick from the rightful first rematcher (rules 2–3).
  if (session.baseWordPickerUid === uid) {
    return true;
  }
  const word = session.baseWord;
  return session.baseWordChosenBy === uid && typeof word === 'string' && word.length >= 2;
}

/** Opted into rematch waiting: online, latch, assigned picker seat, or committed word. */
export function isRematchWaitingLobbyOptedIn(
  session: Pick<GameSession, 'players' | 'resultsExitedBy'> &
    Partial<Pick<GameSession, 'baseWord' | 'baseWordChosenBy' | 'baseWordPickerUid'>>,
  uid: string,
): boolean {
  const player = session.players[uid];
  if (!player) {
    return false;
  }
  if (player.online === true) {
    return true;
  }
  return isRematchDurableLobbyOptIn(session, uid);
}

/**
 * Whether a rostered player should appear in the waiting lobby UI.
 * First-round waiting shows everyone; rematch waiting only shows opt-in participants.
 */
export function isLobbyVisiblePlayer(session: GameSession, uid: string): boolean {
  const player = session.players[uid];
  if (!player) {
    return false;
  }
  // INVARIANT (see docs/known-issues.md — 2026-07 Left players visible in rematch waiting lobby):
  // hasLeft without durable rematch seat → not visible. Stale hasLeft while latch /
  // pickerUid / committed word still mark rematch opt-in must stay visible — otherwise
  // the late joiner sees «Гравці (1)» and steals pick (JZ4Y5).
  if (player.hasLeft === true) {
    if (!isRematchWaitingLobby(session) || !isRematchDurableLobbyOptIn(session, uid)) {
      return false;
    }
  }
  if (!isRematchWaitingLobby(session)) {
    return true;
  }
  const visible = isRematchWaitingLobbyOptedIn(session, uid);
  assertLobbyVisiblePlayerState(uid, player, visible, isRematchDurableLobbyOptIn(session, uid));
  return visible;
}
