import { normalizeRoomCode } from './room-code.js';

/** RTDB root for active multiplayer sessions (see TZ §8). */
export const GAME_SESSIONS_PATH = 'game_sessions';

/** Shared word overlap maps (split from game_sessions for granular listeners). */
export const SESSION_WORD_MAPS_PATH = 'session_word_maps';

export function gameSessionPath(gameId: string): string {
  return `${GAME_SESSIONS_PATH}/${normalizeRoomCode(gameId)}`;
}

export function sessionWordMapsPath(gameId: string): string {
  return `${SESSION_WORD_MAPS_PATH}/${normalizeRoomCode(gameId)}`;
}

export function sessionWordPlayersPerWordPath(gameId: string, normalized: string): string {
  return `${sessionWordMapsPath(gameId)}/wordPlayers/${normalized}`;
}

export function sessionWordFirstPerWordPath(gameId: string, normalized: string): string {
  return `${sessionWordMapsPath(gameId)}/wordFirst/${normalized}`;
}

export function gameSessionPlayersPath(gameId: string): string {
  return `${gameSessionPath(gameId)}/players`;
}

export function gameSessionPlayerPath(gameId: string, playerId: string): string {
  return `${gameSessionPlayersPath(gameId)}/${playerId}`;
}

export function playerWordLeafPath(gameId: string, playerId: string, normalized: string): string {
  return `${playerWordsPath(gameId, playerId)}/${normalized}`;
}

export function playerWordsPath(gameId: string, playerId: string): string {
  return `player_words/${normalizeRoomCode(gameId)}/${playerId}`;
}
