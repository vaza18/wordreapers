/**
 * Lobby → pick-word must `push` (not `replace`) so lobby stays mounted:
 * - lobby keeps `usePlayerOnlinePresence` (no unmount → no leave/offline)
 * - lobby `useSyncedStackBack` does not treat remove as «back home»
 *
 * Pick-word must skip its own presence hook when `fromLobby=1`.
 */
export function lobbyToPickWordRoute(gameId: string): {
  pathname: '/online/pick-word/[gameId]';
  params: { gameId: string; fromLobby: '1' };
} {
  return {
    pathname: '/online/pick-word/[gameId]',
    params: { gameId, fromLobby: '1' },
  };
}

/** Presence on pick-word only when it is the sole in-room owner (not stacked on lobby). */
export function shouldEnablePickWordPresence(fromLobby: boolean): boolean {
  return !fromLobby;
}
