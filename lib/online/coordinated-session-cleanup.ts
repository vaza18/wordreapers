import { markPlayerOffline } from '../firebase/game-session-service.js';
import { markResultsExited } from '../firebase/results-coordination-service.js';
import { isFirebasePermissionDenied } from '../firebase/rtdb-errors.js';
import type { GameSession } from '../firebase/types.js';

import { shouldSkipEmptyArchiveWords } from './session/archive-words-gate.js';
import type { AllPlayerWords } from './session/clone-player-words.js';
import {
  markFinishedArchiveAckSent,
  getFinishedRoundArchive,
  saveFinishedRoundArchive,
} from './session/online-session-archive.js';
import { shouldMarkResultsExited } from './results-viewed.js';

/** Outcome of a local finished-round archive attempt. */
export type PersistLocalArchiveResult =
  | 'saved'
  | 'skipped'
  /** Empty words while maps/archive still claim words — caller must keep pending / retry. */
  | 'skipped_retryable';

/**
 * Soft-skips empty word lists while live maps or an existing archive still claim
 * words (results freeze / rematch wipe races).
 */
export async function persistLocalArchive(
  gameId: string,
  _uid: string,
  session: GameSession,
  words: AllPlayerWords,
): Promise<PersistLocalArchiveResult> {
  if (session.status !== 'finished') {
    return 'skipped';
  }
  const baseWordRound = session.baseWordRound ?? 0;
  const existing = await getFinishedRoundArchive(gameId, baseWordRound);
  if (shouldSkipEmptyArchiveWords(session, words, existing)) {
    return 'skipped_retryable';
  }
  await saveFinishedRoundArchive(gameId, session, words);
  await markFinishedArchiveAckSent(gameId, baseWordRound);
  return 'saved';
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
