import type { PlayerGender } from '../game/grammar.js';
import { assignDisplayRanks, buildStandingsFromSession } from '../game/scoring.js';
import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
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

function playerWordCount(session: GameSession, playerId: string): number {
  return session.players[playerId]?.wordCount ?? 0;
}

function activeCompetitorIds(session: GameSession): string[] {
  return Object.keys(session.players).filter((playerId) => isCompetingInRound(session, playerId));
}

function detectRankEvents(prev: GameSession, curr: GameSession, myUid: string): PlayToastEvent[] {
  if (activeCompetitorIds(curr).length < 2) {
    return [];
  }

  const useScoreRanking = resolveGameSessionSettingsForSession(curr).uniqueBonusEnabled;
  const metric = useScoreRanking ? playerScore : playerWordCount;

  const rankChanged = Object.keys(curr.players).some(
    (playerId) =>
      isCompetingInRound(curr, playerId) && metric(prev, playerId) !== metric(curr, playerId),
  );
  if (!rankChanged) {
    return [];
  }

  const events: PlayToastEvent[] = [];

  for (const playerId of Object.keys(curr.players)) {
    if (playerId === myUid || !isCompetingInRound(curr, playerId)) {
      continue;
    }

    if (metric(curr, playerId) === metric(curr, myUid)) {
      continue;
    }

    const opponentChanged = metric(prev, playerId) !== metric(curr, playerId);
    const myChanged = metric(prev, myUid) !== metric(curr, myUid);

    const theyTookLead =
      metric(curr, playerId) > metric(curr, myUid) &&
      metric(prev, playerId) <= metric(prev, myUid) &&
      (opponentChanged || myChanged);

    const iTookLead =
      metric(curr, myUid) > metric(curr, playerId) &&
      metric(prev, myUid) <= metric(prev, playerId) &&
      (myChanged || opponentChanged);

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
