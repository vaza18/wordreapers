import { markResultsExited } from '../../firebase/results-coordination-service.js';
import {
  readGameSessionSnapshot,
  tryReadGameSessionSnapshot,
  type GameSessionSnapshot,
} from '../../firebase/game-session-service.js';
import { formatLiveRosterDetails } from '../../debug/format-session-roster-log.js';
import { devLogAction } from '../../debug/dev-log.js';
import type { PlayerProfile } from '../../profile/player-profile.js';

import { resolvePostJoinRoute } from '../post-join-route.js';
import { seedPlaySessionBootstrap } from '../session/play-session-bootstrap.js';
import { reconcilePlayerPresence } from '../presence/reconcile-player-presence.js';
import { restartRematchOnlineRound } from './restart-rematch-online-round.js';

export type OptIntoLiveRoundRoute = ReturnType<typeof resolvePostJoinRoute>;

const REMATCH_PRESENCE_OPTS = { reviveAfterLeave: true } as const;

function kickRematchWaitingPresence(gameId: string, myUid: string, profile: PlayerProfile): void {
  void reconcilePlayerPresence(gameId, myUid, profile, REMATCH_PRESENCE_OPTS).catch((error) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('optIntoLiveRound waiting presence', error);
    }
  });
}

/**
 * Opt-in to rematch or rejoin a live round after «Грати ще» on results.
 * Uses fresh RTDB reads so navigation matches room state after the action.
 *
 * Rematch latch is written only after the room is confirmed `waiting`/`playing`
 * (or rematch restart succeeds) — a failed restart must not leave a durable latch
 * that steals the peer's picker seat while this client stays on results.
 *
 * For an already-open rematch `waiting` lobby, presence rejoin is kicked off in
 * the background so results can navigate immediately (peers may already see this
 * player online while the joiner would otherwise sit on results for seconds).
 * The rematch latch is awaited before navigate — peers filter lobby visibility by
 * RTDB `resultsExitedBy` / online, not this client's local opt-in latch.
 * Live `playing` still awaits full presence so `liveRoundPlayerUids` is ready.
 */
export async function optIntoLiveRound(
  gameId: string,
  myUid: string,
  profile: PlayerProfile,
  finishedBaseWordRound: number,
): Promise<OptIntoLiveRoundRoute> {
  devLogAction('tapped play again / rematch', {
    actor: profile.name,
    room: gameId,
    round: finishedBaseWordRound,
  });
  try {
    const initial = await tryReadGameSessionSnapshot(gameId);
    let session: GameSessionSnapshot;
    // Same-round stuck `playing` (expired finish PD — LRAHP) must go through restart heal.
    // A newer live round (`baseWordRound` ahead) is join-only — do not finish it.
    const needsRematchRestart =
      !initial ||
      initial.status === 'finished' ||
      (initial.status === 'playing' && (initial.baseWordRound ?? 0) <= finishedBaseWordRound);
    if (needsRematchRestart) {
      await restartRematchOnlineRound(gameId, myUid, finishedBaseWordRound);
      session = await readGameSessionSnapshot(gameId);
    } else {
      session = initial;
    }

    // Confirm latch after rematch races (peer may have opened waiting first).
    await markResultsExited(gameId, myUid);

    if (session.status === 'playing') {
      await reconcilePlayerPresence(gameId, myUid, profile, REMATCH_PRESENCE_OPTS);
      session = await readGameSessionSnapshot(gameId);
    } else if (session.status === 'waiting') {
      kickRematchWaitingPresence(gameId, myUid, profile);
    }

    const route = resolvePostJoinRoute(session, myUid, gameId);
    if (route.pathname === '/online/play/[gameId]') {
      seedPlaySessionBootstrap(session);
    }
    devLogAction('opted into rematch / live round', {
      actor: profile.name,
      room: gameId,
      round: session.baseWordRound ?? finishedBaseWordRound,
      details: `status=${session.status} → ${route.pathname} ${formatLiveRosterDetails(session)}`,
    });
    return route;
  } catch (error) {
    devLogAction('play again / rematch failed', {
      level: 'error',
      actor: profile.name,
      room: gameId,
      round: finishedBaseWordRound,
      details: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
