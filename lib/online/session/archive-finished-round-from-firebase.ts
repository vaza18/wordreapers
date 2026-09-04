import { tryFetchSessionWordMaps } from '../../firebase/session-word-maps-service.js';
import { wordsByPlayerFromWordPlayers } from '../word-players-invert.js';
import type { GameSession } from '../../firebase/types.js';
import { devLogAction } from '../../debug/dev-log.js';

import {
  pickRicherWordPlayers,
  sessionWordPlayersClaimWords,
  shouldSkipEmptyArchiveWords,
} from './archive-words-gate.js';
import {
  getFinishedRoundArchive,
  isFinishedArchiveStale,
  isLegacyFinishedArchiveWords,
  saveFinishedRoundArchive,
} from './online-session-archive.js';

export type ArchiveFinishedRoundMapsOptions = {
  /**
   * Play listen snapshot — merged with RTDB fetch (richer wins) so offline/stale
   * memory cannot pin an incomplete archive when the server has more claims.
   */
  wordPlayers?: GameSession['wordPlayers'] | null;
};

/**
 * Persist a finished-round archive locally from session word maps.
 * Always attempts an RTDB fetch and keeps the richer of memory vs server
 * (offline clients may hold a partial listen cache). Soft-skips empty maps while
 * live/archive still claim words. Never overwrites pre-v4 / object-shaped archives.
 */
export async function archiveFinishedRoundFromFirebase(
  gameId: string,
  session: GameSession,
  options?: ArchiveFinishedRoundMapsOptions,
): Promise<void> {
  if (session.status !== 'finished') {
    return;
  }
  const memoryWordPlayers = options?.wordPlayers ?? session.wordPlayers;
  const baseWordRound = session.baseWordRound ?? 0;
  const existing = await getFinishedRoundArchive(gameId, baseWordRound);

  // FIX: 2026-09 — prefer-memory-only pinned incomplete offline cache → always fetch+richer
  let wordPlayers = memoryWordPlayers ?? {};
  const mapsResult = await tryFetchSessionWordMaps(gameId);
  if (mapsResult.ok) {
    wordPlayers = pickRicherWordPlayers(memoryWordPlayers, mapsResult.maps.wordPlayers);
  } else if (!sessionWordPlayersClaimWords({ wordPlayers: memoryWordPlayers })) {
    devLogAction('archiveFinishedRoundFromFirebase maps fetch failed', {
      level: 'detail',
      room: gameId,
      details:
        mapsResult.error instanceof Error ? mapsResult.error.message : String(mapsResult.error),
    });
    return;
  }

  const sessionForStale: GameSession = {
    ...session,
    wordPlayers,
  };
  if (
    existing &&
    (isLegacyFinishedArchiveWords(existing) || !isFinishedArchiveStale(existing, sessionForStale))
  ) {
    return;
  }

  const words = wordsByPlayerFromWordPlayers(wordPlayers);
  if (shouldSkipEmptyArchiveWords(sessionForStale, words, existing)) {
    devLogAction('archiveFinishedRoundFromFirebase skip empty maps with claimed words', {
      level: 'detail',
      room: gameId,
    });
    return;
  }
  await saveFinishedRoundArchive(gameId, sessionForStale, words);
}
