import type { StoredPlayerWord } from '../../firebase/player-words-service.js';

export type AllPlayerWords = Map<string, Map<string, StoredPlayerWord>>;

/** Deep-copy word maps so RTDB cleanup does not wipe the results UI. */
export function cloneAllPlayerWords(source: AllPlayerWords): AllPlayerWords {
  const clone: AllPlayerWords = new Map();
  for (const [playerId, words] of source) {
    clone.set(playerId, new Map(words));
  }
  return clone;
}

/** Merge incoming RTDB words into a snapshot (keep the richest copy per player). */
export function mergeAllPlayerWords(into: AllPlayerWords, from: AllPlayerWords): AllPlayerWords {
  const merged = cloneAllPlayerWords(into);
  for (const [playerId, words] of from) {
    const existing = merged.get(playerId);
    if (!existing || words.size > existing.size) {
      merged.set(playerId, new Map(words));
    }
  }
  return merged;
}
