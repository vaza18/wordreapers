import { writeSessionWordMapsShards } from '../../firebase/session-word-maps-service.js';
import type { SessionWordMaps } from '../../firebase/types.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';

/** Write word maps to RTDB after session restore/publish (no per-player storage). */
export async function restoreSessionWordsToRtdb(
  gameId: string,
  wordMaps: SessionWordMaps,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  if (Object.keys(wordMaps.wordPlayers ?? {}).length > 0) {
    await writeSessionWordMapsShards(normalized, wordMaps);
  }
}
