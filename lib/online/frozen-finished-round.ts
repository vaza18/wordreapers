import type { GameSessionSnapshot } from '../firebase/game-session-service.js';
import type { GameSession } from '../firebase/types.js';

import type { AllPlayerWords } from './clone-player-words.js';
import { cloneAllPlayerWords } from './clone-player-words.js';
import { getFinishedRoundArchive, type FinishedRoundArchive } from './online-session-archive.js';

export interface FrozenFinishedRound {
  session: GameSessionSnapshot;
  words: AllPlayerWords;
  savedAt?: number;
}

function wordsFromArchive(archive: FinishedRoundArchive): AllPlayerWords {
  const map: AllPlayerWords = new Map();
  for (const [playerId, words] of Object.entries(archive.playerWords)) {
    map.set(playerId, new Map(Object.entries(words)));
  }
  return map;
}

export function freezeFinishedRound(
  gameId: string,
  session: GameSession,
  words: AllPlayerWords,
): FrozenFinishedRound {
  return {
    session: { ...session, id: gameId },
    words: cloneAllPlayerWords(words),
  };
}

export async function loadFrozenFinishedRoundFromArchive(
  gameId: string,
  baseWordRound: number,
): Promise<FrozenFinishedRound | null> {
  const archive = await getFinishedRoundArchive(gameId, baseWordRound);
  if (!archive) {
    return null;
  }
  return {
    session: { ...archive.session, id: archive.gameId },
    words: wordsFromArchive(archive),
    savedAt: archive.savedAt,
  };
}

export async function loadLatestFrozenFinishedRoundFromArchive(
  gameId: string,
  maxRound = 5,
): Promise<FrozenFinishedRound | null> {
  for (let round = maxRound; round >= 0; round -= 1) {
    const archived = await loadFrozenFinishedRoundFromArchive(gameId, round);
    if (archived) {
      return archived;
    }
  }
  return null;
}

/** Latest local archive strictly before the live `baseWordRound` (skipped rounds). */
export async function loadFrozenFinishedRoundBeforeLive(
  gameId: string,
  liveBaseWordRound: number,
  maxRound = 5,
): Promise<FrozenFinishedRound | null> {
  for (let round = Math.min(liveBaseWordRound - 1, maxRound); round >= 0; round -= 1) {
    const archived = await loadFrozenFinishedRoundFromArchive(gameId, round);
    if (archived) {
      return archived;
    }
  }
  return null;
}
