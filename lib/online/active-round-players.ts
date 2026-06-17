import type { GameSession } from '../firebase/types.js';
import { votingPlayerIds } from './voting-player-ids.js';

export interface ActiveRoundPlayerRow {
  playerId: string;
  name: string;
  online: boolean;
  hasLeft: boolean;
}

/** Players still in the round with live presence flags. */
export function activeRoundPlayerRows(session: GameSession): ActiveRoundPlayerRow[] {
  return votingPlayerIds(session).map((playerId) => {
    const player = session.players[playerId];
    return {
      playerId,
      name: player.name,
      online: player.online === true,
      hasLeft: player.hasLeft === true,
    };
  });
}

export function stillPlayingPlayerNames(session: GameSession, excludeUid: string): string[] {
  return activeRoundPlayerRows(session)
    .filter((row) => row.playerId !== excludeUid && !row.hasLeft && row.online)
    .map((row) => row.name);
}
