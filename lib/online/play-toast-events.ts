import type { PlayerGender } from '../game/grammar.js';
import { assignDisplayRanks, buildStandingsFromSession } from '../game/scoring.js';
import type { GameSession } from '../firebase/types.js';
import { votingPlayerIds } from './voting-player-ids.js';

export type PlayToastEvent =
  | {
      type: 'player_joined';
      playerId: string;
      name: string;
      gender: PlayerGender;
      inviterName?: string;
    }
  | {
      type: 'player_left';
      playerId: string;
      name: string;
      gender: PlayerGender;
      rank: number;
    }
  | { type: 'alone_in_game' }
  | {
      type: 'overtook_me';
      playerId: string;
      name: string;
      gender: PlayerGender;
    }
  | {
      type: 'yielded_to_me';
      playerId: string;
      name: string;
      gender: PlayerGender;
    };

function playerGender(session: GameSession, playerId: string): PlayerGender {
  const raw = session.players[playerId]?.gender;
  return raw === 'f' || raw === 'm' ? raw : null;
}

function isRosterActive(session: GameSession, playerId: string): boolean {
  const player = session.players[playerId];
  return Boolean(player) && player.hasLeft !== true;
}

/** Includes players back online while RTDB still has stale `hasLeft: true`. */
function isCompetingInRound(session: GameSession, playerId: string): boolean {
  const player = session.players[playerId];
  if (!player) {
    return false;
  }
  if (player.hasLeft === true) {
    return player.online === true;
  }
  return true;
}

function detectRosterEvents(prev: GameSession, curr: GameSession, myUid: string): PlayToastEvent[] {
  const events: PlayToastEvent[] = [];
  const currRanks = assignDisplayRanks(buildStandingsFromSession(curr));

  for (const [playerId, player] of Object.entries(curr.players)) {
    if (playerId === myUid) {
      continue;
    }

    const wasPresent = Boolean(prev.players[playerId]);
    const wasRosterActive = wasPresent && isRosterActive(prev, playerId);
    const isRosterActiveNow = isRosterActive(curr, playerId);
    const wasOnline = prev.players[playerId]?.online === true;
    const isOnline = player.online === true;

    if (!wasPresent && isRosterActiveNow) {
      const inviterUid = player.invitedBy;
      if (inviterUid === myUid) {
        continue;
      }
      const inviterName =
        inviterUid && curr.players[inviterUid] ? curr.players[inviterUid].name : undefined;
      events.push({
        type: 'player_joined',
        playerId,
        name: player.name,
        gender: playerGender(curr, playerId),
        inviterName,
      });
      continue;
    }

    if (wasPresent && !wasRosterActive && isRosterActiveNow) {
      events.push({
        type: 'player_joined',
        playerId,
        name: player.name,
        gender: playerGender(curr, playerId),
      });
      continue;
    }

    if (wasPresent && !wasOnline && isOnline && player.hasLeft === true) {
      events.push({
        type: 'player_joined',
        playerId,
        name: player.name,
        gender: playerGender(curr, playerId),
      });
      continue;
    }

    if (wasRosterActive && player.hasLeft === true && !isOnline) {
      events.push({
        type: 'player_left',
        playerId,
        name: player.name,
        gender: playerGender(curr, playerId),
        rank: currRanks.get(playerId) ?? Object.keys(curr.players).length,
      });
    }
  }

  const prevActive = votingPlayerIds(prev);
  const currActive = votingPlayerIds(curr);
  if (
    prevActive.length > 1 &&
    prevActive.includes(myUid) &&
    currActive.length === 1 &&
    currActive[0] === myUid
  ) {
    events.push({ type: 'alone_in_game' });
  }

  return events;
}

function playerScore(session: GameSession, playerId: string): number {
  return session.players[playerId]?.score ?? 0;
}

function isTiedOnScore(session: GameSession, playerA: string, playerB: string): boolean {
  return playerScore(session, playerA) === playerScore(session, playerB);
}

/** True when `leaderId` has more points than `followerId` (ties do not count as ahead). */
function isAheadByScore(session: GameSession, leaderId: string, followerId: string): boolean {
  return playerScore(session, leaderId) > playerScore(session, followerId);
}

function hasPointsChange(prev: GameSession, curr: GameSession, playerId: string): boolean {
  return playerScore(prev, playerId) !== playerScore(curr, playerId);
}

function detectRankEvents(prev: GameSession, curr: GameSession, myUid: string): PlayToastEvent[] {
  const scoreChanged = Object.keys(curr.players).some(
    (playerId) => isCompetingInRound(curr, playerId) && hasPointsChange(prev, curr, playerId),
  );
  if (!scoreChanged) {
    return [];
  }

  const events: PlayToastEvent[] = [];

  for (const playerId of Object.keys(curr.players)) {
    if (playerId === myUid || !isCompetingInRound(curr, playerId)) {
      continue;
    }

    if (isTiedOnScore(curr, playerId, myUid)) {
      continue;
    }

    const opponentPointsChanged = hasPointsChange(prev, curr, playerId);
    const myPointsChanged = hasPointsChange(prev, curr, myUid);

    const theyTookLead =
      isAheadByScore(curr, playerId, myUid) &&
      !isAheadByScore(prev, playerId, myUid) &&
      (opponentPointsChanged || myPointsChanged);

    const iTookLead =
      isAheadByScore(curr, myUid, playerId) &&
      !isAheadByScore(prev, myUid, playerId) &&
      (myPointsChanged || opponentPointsChanged);

    if (theyTookLead) {
      events.push({
        type: 'overtook_me',
        playerId,
        name: curr.players[playerId].name,
        gender: playerGender(curr, playerId),
      });
      continue;
    }

    if (iTookLead) {
      events.push({
        type: 'yielded_to_me',
        playerId,
        name: curr.players[playerId].name,
        gender: playerGender(curr, playerId),
      });
    }
  }

  return events;
}

/**
 * Diff two playing-session snapshots into short toast messages for remaining players.
 */
export function detectPlayToastEvents(
  prev: GameSession,
  curr: GameSession,
  myUid: string,
): PlayToastEvent[] {
  if (curr.status !== 'playing' || prev.status !== 'playing') {
    return [];
  }

  return [...detectRosterEvents(prev, curr, myUid), ...detectRankEvents(prev, curr, myUid)];
}
