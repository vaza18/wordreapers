import { markResultsExited } from '../firebase/results-coordination-service.js';
import {
  readGameSessionSnapshot,
  tryReadGameSessionSnapshot,
  markPlayerOnline,
  rejoinExistingPlayer,
} from '../firebase/game-session-service.js';
import type { PlayerProfile } from '../profile/player-profile.js';

import { resolvePostJoinRoute } from './post-join-route.js';
import { seedPlaySessionBootstrap } from './play-session-bootstrap.js';
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
  let session = await tryReadGameSessionSnapshot(gameId);

  if (!session || session.status === 'finished') {
    await restartRematchOnlineRound(gameId, myUid, finishedBaseWordRound);
    session = await readGameSessionSnapshot(gameId);
  }
  if (session.status === 'waiting' || session.status === 'playing') {
    await rejoinExistingPlayer(gameId, myUid, profile);
    await markPlayerOnline(gameId, myUid);
    session = await readGameSessionSnapshot(gameId);
  }

  const route = resolvePostJoinRoute(session, myUid, gameId);
  if (route.pathname === '/online/play/[gameId]') {
    seedPlaySessionBootstrap({ ...session, id: gameId });
  }
  return route;
}
