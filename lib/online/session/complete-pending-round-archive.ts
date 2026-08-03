import { get, ref } from 'firebase/database';

import { getFirebaseDatabase } from '../../firebase/init.js';
import { gameSessionPath } from '../../firebase/paths.js';
import { tryFetchSessionWordMaps } from '../../firebase/session-word-maps-service.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import type { GameSession } from '../../firebase/types.js';
import { devLogAction } from '../../debug/dev-log.js';
import { buildLiveStandingsFromSession } from '../live-standings.js';
import {
  wordPlayersFromWordsByPlayer,
  wordsByPlayerFromWordPlayers,
} from '../word-players-invert.js';
import type { AllPlayerWords } from './clone-player-words.js';
import { persistLocalArchive } from '../coordinated-session-cleanup.js';
import { finalizeOnlineRoundForPlayer } from '../finalize-online-round.js';
import { clearPendingRoundArchive } from './pending-round-archive.js';

async function readFinishedSession(gameId: string): Promise<GameSession | null> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(ref(getFirebaseDatabase(), gameSessionPath(normalized)));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as GameSession;
}

/**
 * Save local archive + stats once for a finished round on this device.
 */
export async function persistFinishedRoundForPlayer(
  gameId: string,
  uid: string,
  session: GameSession,
  words: AllPlayerWords,
): Promise<void> {
  if (session.status !== 'finished' || !uid) {
    return;
  }

  const baseWordRound = session.baseWordRound ?? 0;
  const standings = buildLiveStandingsFromSession({
    ...session,
    wordPlayers: wordPlayersFromWordsByPlayer(words),
  });

  const archiveResult = await persistLocalArchive(gameId, uid, session, words);
  if (archiveResult === 'skipped_retryable') {
    // Keep pending so sync can retry when maps are non-empty again.
    return;
  }
  await finalizeOnlineRoundForPlayer(gameId, baseWordRound, uid, standings);
  await clearPendingRoundArchive(gameId, baseWordRound);
}

/** Fetch words from RTDB and persist — used by left screen when round finishes live. */
export async function persistFinishedRoundFromFirebase(
  gameId: string,
  uid: string,
  session: GameSession,
): Promise<void> {
  if (session.status !== 'finished' || !uid) {
    return;
  }
  const mapsResult = await tryFetchSessionWordMaps(gameId);
  if (!mapsResult.ok) {
    const details =
      mapsResult.error instanceof Error ? mapsResult.error.message : String(mapsResult.error);
    devLogAction('persistFinishedRoundFromFirebase maps fetch failed', {
      level: 'detail',
      room: gameId,
      details,
    });
    throw mapsResult.error instanceof Error
      ? mapsResult.error
      : new Error(details || 'session word maps fetch failed');
  }
  const words = wordsByPlayerFromWordPlayers(mapsResult.maps.wordPlayers);
  await persistFinishedRoundForPlayer(gameId, uid, session, words);
}

export async function readLiveSession(gameId: string): Promise<GameSession | null> {
  return readFinishedSession(gameId);
}
