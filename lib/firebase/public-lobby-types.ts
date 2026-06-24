/** RTDB row under `public_lobbies/{language}/{gameId}`. */
export interface PublicLobbyIndexEntry {
  baseWord: string;
  baseWordNorm: string;
  playerCount: number;
  maxPlayers: number;
  publishedAt: number;
  expiresAt: number;
}

export type PublicLobbyBrowseSort = 'newest' | 'baseWord';

export interface PublicLobbyRow extends PublicLobbyIndexEntry {
  gameId: string;
}

export type PublicLobbyBrowseCursor = {
  sort: PublicLobbyBrowseSort;
  publishedAt?: number;
  baseWordNorm?: string;
  gameId: string;
};
