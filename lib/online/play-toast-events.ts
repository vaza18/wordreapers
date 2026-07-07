import type { PlayerGender } from '../game/grammar.js';
import { assignDisplayRanks } from '../game/scoring.js';
import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { buildLiveStandingsFromSession } from './live-standings.js';
import {
  isActiveLivePlayer,
  isInLiveRound,
  liveParticipantIds,
  expectedLiveRoundOpponentIds,
} from './presence/live-round-membership.js';

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

function liveRoundUidList(session: GameSession): string[] {
  return session.liveRoundPlayerUids ?? [];
}

// INVARIANT (see docs/known-issues.md — 2026-07 Spurious “player joined” toasts): filter lobby sync vs real mid-round joins.
/**
 * Toast only genuine mid-round joins and rejoins — not lobby participants syncing presence at round start.
 */
export function shouldToastRosterPlayerJoined(
  prev: GameSession,
  curr: GameSession,
  playerId: string,
): boolean {
  if (!becameActiveInLiveRound(prev, curr, playerId)) {
    return false;
  }

  const prevPlayer = prev.players[playerId];
  if (!prevPlayer) {
    return true;
  }

  if (prevPlayer.hasLeft === true && prevPlayer.online !== true) {
    return true;
  }

  const prevUids = liveRoundUidList(prev);
  const currUids = liveRoundUidList(curr);
  if (!prevUids.includes(playerId) && currUids.includes(playerId)) {
    return true;
  }

  if (
    prevPlayer.online !== true &&
    prevPlayer.hasLeft !== true &&
    isInLiveRound(prev, playerId) &&
    ((prevPlayer.wordCount ?? 0) > 0 || (prevPlayer.score ?? 0) > 0)
  ) {
    return true;
  }

  if (prevUids.includes(playerId) && currUids.includes(playerId)) {
    return false;
  }

  return false;
}

function detectRosterEvents(prev: GameSession, curr: GameSession, myUid: string): PlayToastEvent[] {
  const events: PlayToastEvent[] = [];
  const prevRanks = assignDisplayRanks(buildLiveStandingsFromSession(prev));
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
        rank:
          prevRanks.get(playerId) ?? currRanks.get(playerId) ?? Object.keys(curr.players).length,
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

    if (!shouldToastRosterPlayerJoined(prev, curr, playerId)) {
      continue;
    }

    events.push({
      type: 'player_joined',
      playerId,
      name: player.name,
      gender: playerGender(curr, playerId),
    });
  }

  const playerLeftThisDiff = events.some((event) => event.type === 'player_left');
  const currActive =
    curr.status === 'playing'
      ? liveParticipantIds(curr).filter((id) => isActiveLivePlayer(curr, id))
      : [];
  const othersStillExpected = expectedLiveRoundOpponentIds(curr, myUid);
  if (
    playerLeftThisDiff &&
    currActive.length === 1 &&
    currActive[0] === myUid &&
    othersStillExpected.length === 0
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

type RelativeStanding = 'ahead' | 'behind' | 'tied';

function relativeStanding(myMetric: number, theirMetric: number): RelativeStanding {
  if (myMetric > theirMetric) {
    return 'ahead';
  }
  if (myMetric < theirMetric) {
    return 'behind';
  }
  return 'tied';
}

/** Pairwise rank-order flip between viewer and one opponent (at most one toast per opponent). */
export function detectRankEvents(
  prev: GameSession,
  curr: GameSession,
  myUid: string,
): PlayToastEvent[] {
  if (activeCompetitorIds(curr).length < 2) {
    return [];
  }

  const events: PlayToastEvent[] = [];

  for (const playerId of Object.keys(curr.players)) {
    if (playerId === myUid || !isCompetingInRound(curr, playerId)) {
      continue;
    }

    const prevRel = relativeStanding(rankMetric(prev, myUid), rankMetric(prev, playerId));
    const currRel = relativeStanding(rankMetric(curr, myUid), rankMetric(curr, playerId));

    if (prevRel === currRel || currRel === 'tied') {
      continue;
    }

    if (currRel === 'behind') {
      events.push({
        type: 'overtook_me',
        playerId,
        name: curr.players[playerId].name,
        gender: playerGender(curr, playerId),
      });
      continue;
    }

    if (currRel === 'ahead') {
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
