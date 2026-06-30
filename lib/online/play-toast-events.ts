import type { PlayerGender } from '../game/grammar.js';
import { assignDisplayRanks } from '../game/scoring.js';
import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { buildLiveStandingsFromSession } from './live-standings.js';
import { isActiveLivePlayer, liveParticipantIds } from './live-round-membership.js';

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

/** Active in the current playing round (online in RTDB). */
function isCompetingInRound(session: GameSession, playerId: string): boolean {
  return session.players[playerId]?.online === true;
}

function becameActiveInLiveRound(prev: GameSession, curr: GameSession, playerId: string): boolean {
  return isActiveLivePlayer(curr, playerId) && !isActiveLivePlayer(prev, playerId);
}

function detectRosterEvents(prev: GameSession, curr: GameSession, myUid: string): PlayToastEvent[] {
  const events: PlayToastEvent[] = [];
  const currRanks = assignDisplayRanks(buildLiveStandingsFromSession(curr));

  for (const [playerId, player] of Object.entries(curr.players)) {
    if (playerId === myUid) {
      continue;
    }

    const wasPresent = Boolean(prev.players[playerId]);
    const wasRosterActive = wasPresent && isRosterActive(prev, playerId);

    if (wasRosterActive && player.hasLeft === true && player.online !== true) {
      events.push({
        type: 'player_left',
        playerId,
        name: player.name,
        gender: playerGender(curr, playerId),
        rank: currRanks.get(playerId) ?? Object.keys(curr.players).length,
      });
      continue;
    }

    if (!becameActiveInLiveRound(prev, curr, playerId)) {
      continue;
    }

    if (!wasPresent) {
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

    events.push({
      type: 'player_joined',
      playerId,
      name: player.name,
      gender: playerGender(curr, playerId),
    });
  }

  const prevActive =
    prev.status === 'playing'
      ? liveParticipantIds(prev).filter((id) => isActiveLivePlayer(prev, id))
      : [];
  const currActive =
    curr.status === 'playing'
      ? liveParticipantIds(curr).filter((id) => isActiveLivePlayer(curr, id))
      : [];
  const othersStillInLiveRound = liveParticipantIds(curr).filter(
    (id) => id !== myUid && isRosterActive(curr, id),
  );
  if (
    prevActive.length > 1 &&
    prevActive.includes(myUid) &&
    currActive.length === 1 &&
    currActive[0] === myUid &&
    othersStillInLiveRound.length === 0
  ) {
    events.push({ type: 'alone_in_game' });
  }

  return events;
}

/** Same totals as the live standings header (word maps when present). */
function rankMetric(session: GameSession, playerId: string): number {
  const useScoreRanking = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  const row = buildLiveStandingsFromSession(session).find((entry) => entry.playerId === playerId);
  if (!row) {
    return 0;
  }
  return useScoreRanking ? row.score : row.wordCount;
}

function activeCompetitorIds(session: GameSession): string[] {
  return Object.keys(session.players).filter((playerId) => isCompetingInRound(session, playerId));
}

function detectRankEvents(prev: GameSession, curr: GameSession, myUid: string): PlayToastEvent[] {
  if (activeCompetitorIds(curr).length < 2) {
    return [];
  }

  const rankChanged = Object.keys(curr.players).some(
    (playerId) =>
      isCompetingInRound(curr, playerId) &&
      rankMetric(prev, playerId) !== rankMetric(curr, playerId),
  );
  if (!rankChanged) {
    return [];
  }

  const events: PlayToastEvent[] = [];

  for (const playerId of Object.keys(curr.players)) {
    if (playerId === myUid || !isCompetingInRound(curr, playerId)) {
      continue;
    }

    if (rankMetric(curr, playerId) === rankMetric(curr, myUid)) {
      continue;
    }

    const opponentChanged = rankMetric(prev, playerId) !== rankMetric(curr, playerId);
    const myChanged = rankMetric(prev, myUid) !== rankMetric(curr, myUid);

    const theyTookLead =
      rankMetric(curr, playerId) > rankMetric(curr, myUid) &&
      rankMetric(prev, playerId) <= rankMetric(prev, myUid) &&
      (opponentChanged || myChanged);

    const iTookLead =
      rankMetric(curr, myUid) > rankMetric(curr, playerId) &&
      rankMetric(prev, myUid) <= rankMetric(prev, playerId) &&
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
  if (curr.players[myUid] && !isCompetingInRound(curr, myUid)) {
    return [];
  }

  return [...detectRosterEvents(prev, curr, myUid), ...detectRankEvents(prev, curr, myUid)];
}
