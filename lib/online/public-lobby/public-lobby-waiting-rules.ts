import { PUBLIC_LOBBY_TTL_MS } from './constants.js';

/** True when the public browse listing TTL has elapsed. */
export function isPublicLobbyListingExpired(
  publicPublishedAt: number | null | undefined,
  now: number,
  ttlMs = PUBLIC_LOBBY_TTL_MS,
): boolean {
  if (typeof publicPublishedAt !== 'number') {
    return false;
  }
  return publicPublishedAt + ttlMs <= now;
}

/**
 * Public waiting rooms must not start with only the organizer —
 * wait for a guest or turn public off (including after TTL expiry).
 */
export function shouldDisableLobbyStartForPublicSolo(options: {
  isPublic: boolean | undefined;
  lobbyPlayerCount: number;
}): boolean {
  return options.isPublic === true && options.lobbyPlayerCount < 2;
}
