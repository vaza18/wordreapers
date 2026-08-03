import { tryFetchSessionWordMaps } from '../../firebase/session-word-maps-service.js';
import { wordsByPlayerFromWordPlayers } from '../word-players-invert.js';
import type { GameSession } from '../../firebase/types.js';
import { devLogAction } from '../../debug/dev-log.js';

import { shouldSkipEmptyArchiveWords } from './archive-words-gate.js';
import {
  getFinishedRoundArchive,
  isFinishedArchiveStale,
  isLegacyFinishedArchiveWords,
  saveFinishedRoundArchive,
} from './online-session-archive.js';

/**
 * Fetch word maps from RTDB and persist a finished-round archive locally.
 * Skips the write when an up-to-date archive already exists.
 * On maps fetch failure, does not save an empty archive (retry later).
 * Soft-skips empty maps while live wordPlayers or an existing archive still claim words.
 * Successful empty fetch with no claims → valid zero-word archive.
 * Never overwrites pre-v4 / object-shaped word archives (tester-local history).
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
  if (
    existing &&
    (isLegacyFinishedArchiveWords(existing) || !isFinishedArchiveStale(existing, session))
  ) {
    return;
  }
  const mapsResult = await tryFetchSessionWordMaps(gameId);
  if (!mapsResult.ok) {
    devLogAction('archiveFinishedRoundFromFirebase maps fetch failed', {
      level: 'detail',
      room: gameId,
      details:
        mapsResult.error instanceof Error ? mapsResult.error.message : String(mapsResult.error),
    });
    return;
  }
  const words = wordsByPlayerFromWordPlayers(mapsResult.maps.wordPlayers);
  // Do not replace session.wordPlayers with a wiped fetch before the skip gate —
  // core may still claim words while rematch cleared maps.
  const claimSession =
    Object.keys(session.wordPlayers ?? {}).length > 0
      ? session
      : { ...session, wordPlayers: mapsResult.maps.wordPlayers };
  // Soft-skip wipe races (empty invert while maps/archive still claim words).
  // Successful empty fetch with no claims → valid zero-word finished archive.
  if (shouldSkipEmptyArchiveWords(claimSession, words, existing)) {
    devLogAction('archiveFinishedRoundFromFirebase skip empty maps with claimed words', {
      level: 'detail',
      room: gameId,
    });
    return;
  }
  await saveFinishedRoundArchive(gameId, session, words);
}
