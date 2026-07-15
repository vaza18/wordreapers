import type { GameSession, GameSessionPlayer } from '../../firebase/types.js';

import { assertRematchWaitingPlayerPatch } from '../invariants.js';

/** Uids present in the waiting lobby when the current `playing` round started (`online: true`). */
export function waitingLobbyOptInUids(session: Pick<GameSession, 'players'>): string[] {
  return Object.keys(session.players).filter((uid) => session.players[uid]?.online === true);
}

/** Whether this uid was opted into the current live round roster (round 2+). */
export function isInLiveRound(
  session: Pick<GameSession, 'baseWordRound' | 'liveRoundPlayerUids'>,
  playerId: string,
): boolean {
  if ((session.baseWordRound ?? 0) === 0) {
    return true;
  }
  const uids = session.liveRoundPlayerUids;
  if (!uids || uids.length === 0) {
    return false;
  }
  return uids.includes(playerId);
}

export { appendLiveRoundPlayerUid } from '../../firebase/live-round-player-uids.js';

/** True when this player explicitly opted into the next round (Play again / results exit). */
export function hasOptedIntoNextRound(
  session: Pick<GameSession, 'resultsExitedBy'>,
  playerId: string,
  actorUid?: string,
): boolean {
  if (actorUid && playerId === actorUid) {
    return true;
  }
  return session.resultsExitedBy?.[playerId] === true;
}

/** True when this player opted into the current live `playing` round (rematch presence). */
export function isActiveLivePlayer(
  session:
    | Pick<GameSession, 'status' | 'baseWordRound' | 'liveRoundPlayerUids' | 'players'>
    | null
    | undefined,
  playerId: string,
): boolean {
  if (!session || session.status !== 'playing' || !playerId) {
    return false;
  }
  if (!isInLiveRound(session, playerId)) {
    return false;
  }
  const player = session.players[playerId];
  if (!player) {
    return false;
  }
  // Voluntarily left: offline with hasLeft. Stale hasLeft while online still counts as active.
  if (player.hasLeft === true && player.online !== true) {
    return false;
  }
  return player.online === true;
}

/**
 * Player counts as part of the current live `playing` round.
 * Online participants in `liveRoundPlayerUids`, plus brief same-round reconnects
 * (offline with scores, but only when opted into this round).
 */
export function isLiveParticipant(session: GameSession, playerId: string): boolean {
  const player = session.players[playerId];
  if (!player) {
    return false;
  }
  if (player.hasLeft === true && player.online !== true) {
    return false;
  }
  if (session.status !== 'playing') {
    return false;
  }
  if (isActiveLivePlayer(session, playerId)) {
    return true;
  }
  if (player.online !== true && isInLiveRound(session, playerId)) {
    if (player.hasLeft === true) {
      return false;
    }
    // Rematch rounds: explicit live roster includes late «Грати ще» joiners before first word.
    if ((session.baseWordRound ?? 0) > 0) {
      return true;
    }
    return (player.wordCount ?? 0) > 0 || (player.score ?? 0) > 0;
  }
  return false;
}

export function liveParticipantIds(session: GameSession): string[] {
  return Object.keys(session.players).filter((id) => isLiveParticipant(session, id));
}

/** Whether this player belongs in finished-round standings (no online/presence gate). */
export function isFinishedRoundStandingsParticipant(
  session: Pick<GameSession, 'baseWordRound' | 'liveRoundPlayerUids' | 'players' | 'wordPlayers'>,
  playerId: string,
): boolean {
  const player = session.players[playerId];
  if (!player || !isInLiveRound(session, playerId)) {
    return false;
  }
  const scoredInRound =
    (player.wordCount ?? 0) > 0 ||
    (player.score ?? 0) > 0 ||
    Object.values(session.wordPlayers ?? {}).some((onWord) => onWord[playerId]);
  if (player.hasLeft === true) {
    return scoredInRound;
  }
  if ((session.baseWordRound ?? 0) === 0) {
    return scoredInRound;
  }
  return true;
}

/** Live roster scope for results after `status === 'finished'`. */
export function finishedRoundParticipantIds(
  session: Pick<GameSession, 'baseWordRound' | 'liveRoundPlayerUids' | 'players' | 'wordPlayers'>,
): string[] {
  return Object.keys(session.players).filter((id) =>
    isFinishedRoundStandingsParticipant(session, id),
  );
}

export function liveParticipantOpponentIds(session: GameSession, myUid: string): string[] {
  return liveParticipantIds(session).filter((id) => id !== myUid);
}

/**
 * True when this round ever had another participant (joined roster / live round),
 * including players who left before the round ended. Used for multiplayer play UI
 * (standings chip, x2 badges, overlap avatars) — not for vote consensus.
 */
export function hasMultiplayerRound(
  session: Pick<GameSession, 'baseWordRound' | 'liveRoundPlayerUids' | 'players'>,
  myUid: string,
): boolean {
  if ((session.baseWordRound ?? 0) === 0) {
    return Object.keys(session.players).some((id) => id !== myUid);
  }
  if ((session.liveRoundPlayerUids ?? []).some((id) => id !== myUid)) {
    return true;
  }
  // Mid-round joiners may appear in `players` before `liveRoundPlayerUids` catches up
  // (join metadata write raced). Online peers → multipplayer UI for the solo starter.
  return Object.keys(session.players).some((id) => {
    if (id === myUid) {
      return false;
    }
    const player = session.players[id];
    return player != null && player.hasLeft !== true && player.online === true;
  });
}

/** Live participants plus players who left mid-round but scored in this round. */
export function playingRoundStandingsParticipantIds(session: GameSession): string[] {
  const ids = new Set(liveParticipantIds(session));
  for (const playerId of Object.keys(session.players)) {
    if (ids.has(playerId)) {
      continue;
    }
    const player = session.players[playerId];
    if (player?.hasLeft === true && isFinishedRoundStandingsParticipant(session, playerId)) {
      ids.add(playerId);
    }
  }
  return [...ids];
}

// INVARIANT (see docs/known-issues.md — 2026-07 False “alone in game” toast): expected roster members count even when briefly offline.
/**
 * Still rostered for this live round and has not voluntarily left (may be briefly offline).
 * Used to avoid «alone in game» toasts during presence sync at round start.
 */
export function isExpectedLiveRoundParticipant(
  session: Pick<GameSession, 'baseWordRound' | 'liveRoundPlayerUids' | 'players'>,
  playerId: string,
): boolean {
  const player = session.players[playerId];
  if (!player || player.hasLeft === true) {
    return false;
  }
  return isInLiveRound(session, playerId);
}

export function expectedLiveRoundOpponentIds(
  session: Pick<GameSession, 'baseWordRound' | 'liveRoundPlayerUids' | 'players'>,
  myUid: string,
): string[] {
  return Object.keys(session.players).filter(
    (id) => id !== myUid && isExpectedLiveRoundParticipant(session, id),
  );
}

/** Presence and score reset when a finished session reopens for rematch. */
export function rematchWaitingPlayerPatch(
  session: GameSession,
  playerId: string,
  actorUid: string,
): Pick<GameSessionPlayer, 'score' | 'wordCount' | 'online' | 'hasLeft'> {
  const optedIn = hasOptedIntoNextRound(session, playerId, actorUid);
  const patch = optedIn
    ? { score: 0, wordCount: 0, online: true, hasLeft: false as const }
    : { score: 0, wordCount: 0, online: false as const, hasLeft: false as const };
  assertRematchWaitingPlayerPatch(playerId, optedIn, patch);
  return patch;
}
