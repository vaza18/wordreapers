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

/**
 * Leave pick-word when the room left `waiting` or this uid no longer holds the seat.
 * Must not require screen focus — multi-sim / background still receive RTDB updates,
 * and the early rematcher must yield when the rightful picker opts in (ZF6U4).
 */
export function shouldLeavePickWordScreen(
  session: { status: string },
  isCurrentPicker: boolean,
): boolean {
  if (session.status !== 'waiting') {
    return true;
  }
  return !isCurrentPicker;
}
