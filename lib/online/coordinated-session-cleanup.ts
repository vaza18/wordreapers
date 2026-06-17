import { markPlayerOffline } from '../firebase/game-session-service.js';
import { markResultsExited } from '../firebase/results-coordination-service.js';
import { isFirebasePermissionDenied } from '../firebase/rtdb-errors.js';
import type { GameSession } from '../firebase/types.js';

import type { AllPlayerWords } from './clone-player-words.js';
import { markFinishedArchiveAckSent, saveFinishedRoundArchive } from './online-session-archive.js';
import { shouldMarkResultsExited } from './results-viewed.js';

/**
 * Persist finished round locally on this device.
 * RTDB purge is handled by scheduled Cloud Function (`purgeAfterAt`).
 */
export async function persistLocalArchive(
  gameId: string,
  _uid: string,
  session: GameSession,
  words: AllPlayerWords,
): Promise<void> {
  if (session.status !== 'finished') {
    return;
  }
  const baseWordRound = session.baseWordRound ?? 0;
  await saveFinishedRoundArchive(gameId, session, words);
  await markFinishedArchiveAckSent(gameId, baseWordRound);
}

/**
 * Record that this player left results and clear RTDB presence.
 */
export async function markResultsExitedAndOffline(
  gameId: string,
  uid: string,
  session: GameSession | null,
): Promise<void> {
  if (session && shouldMarkResultsExited(session, uid)) {
    try {
      await markResultsExited(gameId, uid);
    } catch (error) {
      if (!isFirebasePermissionDenied(error)) {
        throw error;
      }
    }
  }
  if (session?.players[uid]) {
    await markPlayerOffline(gameId, uid);
  }
}
