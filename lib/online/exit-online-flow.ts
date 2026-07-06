import { get, ref } from 'firebase/database';

import { navigateHomeWithBackAnimation } from '@/lib/navigation/navigate-home';

import {
  abandonWaitingGameSession,
  leaveGameSession,
  markPlayerOffline,
  organizerLeaveWaitingLobby,
} from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import type { GameSession } from '../firebase/types.js';
import type { StoredPlayerWord } from '../firebase/player-words-service.js';

import { abandonTrackedOrganizerWaitingRoom } from './abandon-tracked-waiting-room.js';
import type { AllPlayerWords } from './clone-player-words.js';
import { markResultsExitedAndOffline, persistLocalArchive } from './coordinated-session-cleanup.js';
import { setOrganizerWaitingRoom } from './organizer-waiting-room.js';
import { cacheActiveRoundProgress } from './cache-active-round.js';

export interface ExitOnlineFlowOptions {
  gameId: string;
  uid: string;
  isOrganizer: boolean;
  sessionStatus: 'waiting' | 'playing' | 'finished' | null;
  session?: GameSession | null;
  myWords?: Map<string, StoredPlayerWord>;
  /** Words snapshot for local archive when leaving finished results. */
  wordsForArchive?: AllPlayerWords;
  /** True when leaving the finished results screen for home. */
  exitedResults?: boolean;
  /** Navigate immediately and finish RTDB cleanup in the background (offline UX). */
  preferImmediateNavigation?: boolean;
}

async function readLiveSession(gameId: string): Promise<GameSession | null> {
  const snapshot = await get(ref(getFirebaseDatabase(), gameSessionPath(gameId)));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as GameSession;
}

async function runExitCleanup(options: ExitOnlineFlowOptions): Promise<void> {
  const { gameId, uid, isOrganizer, sessionStatus, exitedResults, wordsForArchive } = options;

  const liveFromDb = await readLiveSession(gameId);
  const liveStatus = liveFromDb?.status ?? sessionStatus;
  const isLiveOrganizer = liveFromDb?.organizerId === uid;

  if (liveStatus === 'finished' && uid) {
    const liveSession = liveFromDb ?? options.session;
    if (liveSession?.status === 'finished') {
      if (wordsForArchive) {
        try {
          await persistLocalArchive(gameId, uid, liveSession, wordsForArchive);
        } catch (error) {
          if (__DEV__) {
            console.warn('exitOnlineToHome archive', error);
          }
        }
      }
      if (exitedResults) {
        try {
          await markResultsExitedAndOffline(gameId, uid, liveSession);
        } catch (error) {
          if (__DEV__) {
            console.warn('exitOnlineToHome results exit', error);
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
 * Leave online flow. Waiting-room cleanup completes before navigation so abandon is reliable.
 */
export async function exitOnlineToHome(options: ExitOnlineFlowOptions): Promise<void> {
  const { gameId, uid, sessionStatus, session, myWords, exitedResults } = options;

  if (sessionStatus === 'playing' && session && myWords) {
    await cacheActiveRoundProgress(gameId, uid, session, myWords);
  }

  const shouldAwaitCleanup = sessionStatus === 'waiting' || Boolean(exitedResults);
  const immediate = Boolean(options.preferImmediateNavigation);

  if (shouldAwaitCleanup && immediate) {
    void runExitCleanup(options).catch((error) => {
      if (__DEV__) {
        console.warn('exitOnlineToHome cleanup', error);
      }
    });
    navigateHomeWithBackAnimation();
    return;
  }

  if (shouldAwaitCleanup) {
    try {
      await runExitCleanup(options);
    } catch (error) {
      if (__DEV__) {
        console.warn('exitOnlineToHome cleanup', error);
      }
    }
  } else {
    void runExitCleanup(options).catch((error) => {
      if (__DEV__) {
        console.warn('exitOnlineToHome cleanup', error);
      }
    });
  }

  navigateHomeWithBackAnimation();
}
