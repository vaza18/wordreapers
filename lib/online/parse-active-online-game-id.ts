/**
 * Game id for the current online screen, if any.
 * Sync must not abandon / mutate this room while the player is still on it.
 *
 * Path-embedded ids: play / results / lobby / pick-word.
 * Query/param id: `/online/setup?gameId=` (round-0 waiting from lobby).
 *
 * `searchParams.gameId` is only consulted on `/online/setup` so stale global
 * params from a previous room do not protect the wrong session on other routes.
 */
export function parseActiveOnlineGameId(
  pathname: string,
  searchParams?: { gameId?: string | string[] | null },
): string | null {
  const pathOnly = pathname.split('?')[0]?.replace(/\/+$/, '') ?? '';
  const pathMatch = pathOnly.match(/^\/online\/(?:play|results|lobby|pick-word)\/([^/]+)$/);
  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  if (pathOnly === '/online/setup') {
    const fromQuery = new URLSearchParams(
      pathname.includes('?') ? (pathname.split('?')[1] ?? '') : '',
    )
      .get('gameId')
      ?.trim();
    if (fromQuery) {
      return fromQuery;
    }
    const raw = searchParams?.gameId;
    const fromParams = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    return fromParams || null;
  }

  return null;
}

/** Pass route `gameId` into parse only while on setup (avoids stale global params). */
export function resolveActiveOnlineGameIdForSync(
  pathname: string,
  routeGameId?: string | null,
): string | null {
  const pathOnly = pathname.split('?')[0]?.replace(/\/+$/, '') ?? '';
  const setupParams = pathOnly === '/online/setup' ? { gameId: routeGameId } : undefined;
  return parseActiveOnlineGameId(pathname, setupParams);
}
