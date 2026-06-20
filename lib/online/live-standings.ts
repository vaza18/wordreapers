import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { buildStandingsFromSessionWordMaps, type PlayerStandings } from '../game/scoring.js';

type SessionForStandings = Pick<GameSession, 'players' | 'wordPlayers' | 'settings'>;

/** Standings with scores derived from wordPlayers (matches x2 badges). */
export function buildLiveStandingsFromSession(session: SessionForStandings): PlayerStandings[] {
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  return buildStandingsFromSessionWordMaps(session, uniqueBonusEnabled);
}

export function liveScoreForPlayer(session: SessionForStandings, playerId: string): number {
  return (
    buildLiveStandingsFromSession(session).find((row) => row.playerId === playerId)?.score ?? 0
  );
}

export function sessionPlayerScoresMatchWordMaps(session: SessionForStandings): boolean {
  const live = buildLiveStandingsFromSession(session);
  return live.every((row) => (session.players[row.playerId]?.score ?? 0) === row.score);
}
