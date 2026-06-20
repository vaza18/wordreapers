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

export function playerWordsPath(gameId: string, playerId: string): string {
  return `player_words/${normalizeRoomCode(gameId)}/${playerId}`;
}
