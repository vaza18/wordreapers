import type { GameSessionSnapshot } from '../firebase/game-session-service.js';
import { buildLiveStandingsFromSession } from './live-standings.js';
import { liveParticipantIds } from './live-round-membership.js';

/**
 * Roster/presence signature — excludes scores so join/leave toasts are not re-run on every word.
 */
export function playToastRosterSignature(session: GameSessionSnapshot): string {
  const participantIds = liveParticipantIds(session).sort();
  const playerParts = participantIds.map((uid) => {
    const player = session.players[uid];
    if (!player) {
      return `${uid}:missing`;
    }
    return `${uid}:${player.online}:${player.hasLeft}:${player.name}`;
  });
  const liveUids = (session.liveRoundPlayerUids ?? []).slice().sort().join(',');
  return `${session.id}:${session.status}:${session.baseWordRound ?? 0}:${liveUids}:${playerParts.join('|')}`;
}

/** Standings signature from word maps when present (matches on-screen rank). */
export function playToastRankSignature(session: GameSessionSnapshot): string {
  const standings = buildLiveStandingsFromSession(session)
    .map((row) => `${row.playerId}:${row.score}:${row.wordCount}`)
    .sort()
    .join('|');
  return `${session.id}:${session.status}:${session.baseWordRound ?? 0}:${standings}`;
}
