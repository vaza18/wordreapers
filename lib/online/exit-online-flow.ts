import { get, ref } from 'firebase/database';

import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';
import { navigateHomeClearingStack } from '@/lib/navigation/navigate-home';

import {
  beginVoluntaryLeave,
  endVoluntaryLeave,
  abandonWaitingGameSession,
  leaveGameSession,
  markPlayerOffline,
  organizerLeaveWaitingLobby,
} from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import type { GameSession } from '../firebase/types.js';

import { abandonTrackedOrganizerWaitingRoom } from './abandon-tracked-waiting-room.js';
import type { AllPlayerWords } from './session/clone-player-words.js';
import { markResultsExitedAndOffline, persistLocalArchive } from './coordinated-session-cleanup.js';
import { setOrganizerWaitingRoom } from './organizer-waiting-room.js';
import { cacheActiveRoundProgress } from './session/cache-active-round.js';
import { clearLeftOnlineResume } from './session/left-online-resume.js';
import { clearPausedOnlineResume } from './session/paused-online-resume.js';
import { markPendingRoundArchive } from './session/pending-round-archive.js';
import { resetFinishedRoundResultsHandoff } from './session/finished-round-results-handoff.js';

export interface ExitOnlineFlowOptions {
  gameId: string;
  uid: string;
  isOrganizer: boolean;
  sessionStatus: 'waiting' | 'playing' | 'finished' | null;
  session?: GameSession | null;
  /** Own normalized words for active-round cache when leaving mid-play. */
  myWords?: ReadonlySet<string> | readonly string[];
  /** Words snapshot for local archive when leaving finished results. */
  wordsForArchive?: AllPlayerWords;
  /** True when leaving the finished results screen for home. */
  exitedResults?: boolean;
}

async function readLiveSession(gameId: string): Promise<GameSession | null> {
  const snapshot = await get(ref(getFirebaseDatabase(), gameSessionPath(gameId)));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as GameSession;
}

async function runExitCleanup(
  options: ExitOnlineFlowOptions,
  liveFromDb: GameSession | null,
): Promise<void> {
  const { gameId, uid, isOrganizer, sessionStatus, exitedResults, wordsForArchive } = options;

  const liveStatus = liveFromDb?.status ?? sessionStatus;
  const isLiveOrganizer = liveFromDb?.organizerId === uid;

  if (liveStatus === 'finished' && uid) {
    const liveSession = liveFromDb ?? options.session;
    if (liveSession?.status === 'finished') {
      if (wordsForArchive) {
        try {
          const archiveResult = await persistLocalArchive(
            gameId,
            uid,
            liveSession,
            wordsForArchive,
          );
          if (archiveResult === 'skipped_retryable') {
            await markPendingRoundArchive(gameId, liveSession.baseWordRound ?? 0, uid);
          }
        } catch (error) {
          if (__DEV__) {
            console.warn('exitOnlineSession archive', error);
          }
        }
      }
      if (exitedResults) {
        try {
          await markResultsExitedAndOffline(gameId, uid, liveSession);
        } catch (error) {
          if (__DEV__) {
            console.warn('exitOnlineSession results exit', error);
          }
        }
      } else if (liveSession.players[uid]) {
        await markPlayerOffline(gameId, uid);
      }
    }
  }

  if (isOrganizer || isLiveOrganizer) {
    if (liveStatus === 'waiting' && liveFromDb) {
      await organizerLeaveWaitingLobby(gameId, uid, liveFromDb);
    } else if (liveStatus === 'waiting') {
      await markPlayerOffline(gameId, uid);
      await abandonWaitingGameSession(gameId, uid);
    }
    await abandonTrackedOrganizerWaitingRoom(uid);
    setOrganizerWaitingRoom(null);
  } else if (liveStatus === 'waiting' && uid) {
    await leaveGameSession(gameId, uid);
  }
}

/**
 * Leave the current online room (archive / presence / waiting cleanup) without navigating.
 * Use before opening a new room so `dismissTo('/')` cannot race a follow-up setup route.
 */
export async function exitOnlineSession(options: ExitOnlineFlowOptions): Promise<void> {
  const { gameId, uid, sessionStatus, session, myWords, exitedResults } = options;

  // ADR-025: leave room for home / next room — flush sticky diagnostics group now
  // (do not wait for subscribeGameSession teardown; play→results must stay sticky).
  resetFinishedRoundResultsHandoff();
  rtdbTrafficProbe.setActiveRoomId(null);

  await clearPausedOnlineResume();
  await clearLeftOnlineResume();

  if (sessionStatus === 'playing' && session) {
    await cacheActiveRoundProgress(gameId, uid, session, myWords ?? []);
  }

  const liveFromDb = await readLiveSession(gameId);
  const liveStatus = liveFromDb?.status ?? sessionStatus;
  const leavingWaitingRoom = liveStatus === 'waiting';
  const shouldAwaitCleanup =
    leavingWaitingRoom || sessionStatus === 'waiting' || Boolean(exitedResults);
  const guardWaitingLeave = leavingWaitingRoom && Boolean(uid);

  if (guardWaitingLeave && uid) {
    beginVoluntaryLeave(gameId, uid);
  }

  try {
    if (shouldAwaitCleanup) {
      try {
        await runExitCleanup(options, liveFromDb);
      } catch (error) {
        if (__DEV__) {
          console.warn('exitOnlineSession cleanup', error);
        }
      }
    } else {
      void runExitCleanup(options, liveFromDb).catch((error) => {
        if (__DEV__) {
          console.warn('exitOnlineSession cleanup', error);
        }
      });
    }
  } finally {
    if (guardWaitingLeave && uid) {
      endVoluntaryLeave(gameId, uid);
    }
  }
}

/**
 * Leave online flow. Waiting-room cleanup completes before navigation so abandon is reliable.
 *
 * Results may still show a frozen `finished` archive while RTDB is already rematch
 * `waiting` — Home must leave that waiting room (`hasLeft`) so peers can continue alone.
 */
export async function exitOnlineToHome(options: ExitOnlineFlowOptions): Promise<void> {
  await exitOnlineSession(options);
  navigateHomeClearingStack();
}
