import { fetchSessionPlayerWords } from '../firebase/player-words-service.js';
import type { GameSession } from '../firebase/types.js';

import {
  getFinishedRoundArchive,
  isFinishedArchiveStale,
  saveFinishedRoundArchive,
} from './online-session-archive.js';

/**
 * Fetch all player words from RTDB and persist a finished-round archive locally.
 * Skips the write when an up-to-date archive already exists.
 */
export async function archiveFinishedRoundFromFirebase(
  gameId: string,
  session: GameSession,
): Promise<void> {
  if (session.status !== 'finished') {
    return;
  }
  const baseWordRound = session.baseWordRound ?? 0;
  const existing = await getFinishedRoundArchive(gameId, baseWordRound);
  if (existing && !isFinishedArchiveStale(existing, session)) {
    return;
  }
  const playerIds = Object.keys(session.players);
  const words = await fetchSessionPlayerWords(gameId, playerIds);
  await saveFinishedRoundArchive(gameId, session, words);
}
