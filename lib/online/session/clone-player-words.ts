export type AllPlayerWords = Map<string, string[]>;

/** Deep-copy word maps so RTDB cleanup does not wipe the results UI. */
export function cloneAllPlayerWords(source: AllPlayerWords): AllPlayerWords {
  const clone: AllPlayerWords = new Map();
  for (const [playerId, words] of source) {
    clone.set(playerId, [...words]);
  }
  return clone;
}
