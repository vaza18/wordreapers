import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { buildStandingsFromSessionWordMaps, type PlayerStandings } from '../game/scoring.js';

import { liveParticipantIds } from './presence/live-round-membership.js';

type SessionForStandings = Pick<
  GameSession,
  'players' | 'wordPlayers' | 'settings' | 'status' | 'baseWordRound' | 'liveRoundPlayerUids'
>;

/** Standings for live-round participants only (scores derived from wordPlayers; matches x2 badges). */
export function buildLiveStandingsFromSession(session: SessionForStandings): PlayerStandings[] {
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  const all = buildStandingsFromSessionWordMaps(session, uniqueBonusEnabled);
  const participantIds = new Set(liveParticipantIds(session as GameSession));
  return all.filter((row) => participantIds.has(row.playerId));
}

export function liveScoreForPlayer(session: SessionForStandings, playerId: string): number {
  return (
    buildLiveStandingsFromSession(session).find((row) => row.playerId === playerId)?.score ?? 0
  );
}

export function sessionPlayerScoresMatchWordMaps(session: SessionForStandings): boolean {
  const live = buildLiveStandingsFromSession(session);
  return live.every((row) => {
    const stored = session.players[row.playerId];
    return (stored?.score ?? 0) === row.score && (stored?.wordCount ?? 0) === row.wordCount;
  });
}
