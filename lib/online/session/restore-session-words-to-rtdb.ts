import { ref, set } from 'firebase/database';

import { getFirebaseDatabase } from '../../firebase/init.js';
import { playerWordsPath } from '../../firebase/paths.js';
import { writeSessionWordMapsShards } from '../../firebase/session-word-maps-service.js';
import type { StoredPlayerWord } from '../../firebase/player-words-service.js';
import type { SessionWordMaps } from '../../firebase/types.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';

/** Write word maps and per-player word records to RTDB after session restore/publish. */
export async function restoreSessionWordsToRtdb(
  gameId: string,
  wordMaps: SessionWordMaps,
  playerWords: Readonly<Record<string, Readonly<Record<string, StoredPlayerWord>>>>,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  if (Object.keys(wordMaps.wordPlayers ?? {}).length > 0) {
    await writeSessionWordMapsShards(normalized, wordMaps);
  }

  await Promise.all(
    Object.entries(playerWords).map(async ([playerId, words]) => {
      if (Object.keys(words).length === 0) {
        return;
      }
      await set(ref(getFirebaseDatabase(), playerWordsPath(normalized, playerId)), words);
    }),
  );
}
