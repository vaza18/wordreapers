import { markResultsExited } from '../firebase/results-coordination-service.js';
import {
  readGameSessionSnapshot,
  tryReadGameSessionSnapshot,
  type GameSessionSnapshot,
} from '../firebase/game-session-service.js';
import type { PlayerProfile } from '../profile/player-profile.js';

import { resolvePostJoinRoute } from './post-join-route.js';
import { seedPlaySessionBootstrap } from './play-session-bootstrap.js';
import { reconcilePlayerPresence } from './reconcile-player-presence.js';
import { restartRematchOnlineRound } from './restart-rematch-online-round.js';

export type OptIntoLiveRoundRoute = ReturnType<typeof resolvePostJoinRoute>;

/**
 * Opt-in to rematch or rejoin a live round after «Грати ще» on results.
 * Uses fresh RTDB reads so navigation matches room state after the action.
 */
export async function optIntoLiveRound(
  gameId: string,
  myUid: string,
  profile: PlayerProfile,
  finishedBaseWordRound: number,
): Promise<OptIntoLiveRoundRoute> {
  await markResultsExited(gameId, myUid);
  const initial = await tryReadGameSessionSnapshot(gameId);
  let session: GameSessionSnapshot;
  if (!initial || initial.status === 'finished') {
    await restartRematchOnlineRound(gameId, myUid, finishedBaseWordRound);
    session = await readGameSessionSnapshot(gameId);
  } else {
    session = initial;
  }
  if (session.status === 'waiting' || session.status === 'playing') {
    await reconcilePlayerPresence(gameId, myUid, profile);
    session = await readGameSessionSnapshot(gameId);
  }

  const route = resolvePostJoinRoute(session, myUid, gameId);
  if (route.pathname === '/online/play/[gameId]') {
    seedPlaySessionBootstrap(session);
  }
  return route;
}
