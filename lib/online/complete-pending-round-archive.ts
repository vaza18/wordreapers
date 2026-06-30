import { get, ref } from 'firebase/database';

import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { fetchSessionPlayerWords } from '../firebase/player-words-service.js';
import { normalizeRoomCode } from '../firebase/room-code.js';
import type { GameSession } from '../firebase/types.js';
import { buildStandingsFromSession } from '../game/scoring.js';

import type { AllPlayerWords } from './clone-player-words.js';
import { persistLocalArchive } from './coordinated-session-cleanup.js';
import { finalizeOnlineRoundForPlayer } from './finalize-online-round.js';
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
  const standings = buildStandingsFromSession(session);

  await persistLocalArchive(gameId, uid, session, words);
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
  const playerIds = Object.keys(session.players);
  const words = await fetchSessionPlayerWords(gameId, playerIds);
  await persistFinishedRoundForPlayer(gameId, uid, session, words);
}

export async function readLiveSession(gameId: string): Promise<GameSession | null> {
  return readFinishedSession(gameId);
}
