/** RTDB root for active multiplayer sessions (see TZ §8). */
export const GAME_SESSIONS_PATH = 'game_sessions';

export function gameSessionPath(gameId: string): string {
  return `${GAME_SESSIONS_PATH}/${gameId}`;
}

export function playerWordsPath(gameId: string, playerId: string): string {
  return `player_words/${gameId}/${playerId}`;
}
