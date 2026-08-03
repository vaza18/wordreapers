import { tryFetchSessionWordMaps } from '../firebase/session-word-maps-service.js';
import type { GameSession } from '../firebase/types.js';

import { isLiveParticipant, playerHasScoredInRound } from './presence/live-round-membership.js';
import { resolvePostJoinRoute, type PostJoinRoute } from './post-join-route.js';
import { getActiveRoundCache } from './session/active-round-cache.js';

const MAPS_FETCH_ATTEMPTS = 3;
const MAPS_FETCH_RETRY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function tryFetchSessionWordMapsWithRetry(gameId: string) {
  let last = await tryFetchSessionWordMaps(gameId);
  for (let attempt = 1; attempt < MAPS_FETCH_ATTEMPTS && !last.ok; attempt += 1) {
    await delay(MAPS_FETCH_RETRY_MS);
    last = await tryFetchSessionWordMaps(gameId);
  }
  return last;
}

/**
 * Join returns a core session without merged wordPlayers. For playing rounds where
 * membership depends on maps (round-0 offline scorer), fetch maps before routing.
 *
 * On maps failure: retry briefly, then consult local active-round cache for this
 * timer (reconnect scorer). Cold inactive joiners have no cache → results.
 * Do **not** prefer play solely because round-0 `isInLiveRound` is always true.
 */
export async function resolvePostJoinRouteWithMaps(
  session: GameSession,
  uid: string,
  gameId: string,
): Promise<PostJoinRoute> {
  if (session.status !== 'playing' || isLiveParticipant(session, uid)) {
    return resolvePostJoinRoute(session, uid, gameId);
  }
  const mapsResult = await tryFetchSessionWordMapsWithRetry(gameId);
  if (mapsResult.ok) {
    return resolvePostJoinRoute(
      { ...session, wordPlayers: mapsResult.maps.wordPlayers },
      uid,
      gameId,
    );
  }

  const cached = await getActiveRoundCache(gameId, session.baseWordRound ?? 0);
  if (
    cached?.sessionSnapshot?.wordPlayers &&
    cached.timerEndsAt === session.timerEndsAt &&
    playerHasScoredInRound(
      { players: session.players, wordPlayers: cached.sessionSnapshot.wordPlayers },
      uid,
    )
  ) {
    return resolvePostJoinRoute(
      { ...session, wordPlayers: cached.sessionSnapshot.wordPlayers },
      uid,
      gameId,
    );
  }

  return resolvePostJoinRoute(session, uid, gameId);
}
