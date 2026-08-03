import type { SessionWordMaps } from '../firebase/types.js';

type WordPlayers = NonNullable<SessionWordMaps['wordPlayers']>;

/** Normalized words submitted by one player (from shared wordPlayers index). */
export function normalizedWordsForUid(wordPlayers: WordPlayers | undefined, uid: string): string[] {
  if (!wordPlayers) {
    return [];
  }
  const out: string[] = [];
  for (const [normalized, playersOnWord] of Object.entries(wordPlayers)) {
    if (playersOnWord?.[uid]) {
      out.push(normalized);
    }
  }
  return out;
}

/** True when both sets have the same membership (order-independent). */
export function sameStringSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

/** Invert word→players into player→normalized words. */
export function wordsByPlayerFromWordPlayers(
  wordPlayers: WordPlayers | undefined,
): Map<string, string[]> {
  const byPlayer = new Map<string, string[]>();
  if (!wordPlayers) {
    return byPlayer;
  }
  for (const [normalized, playersOnWord] of Object.entries(wordPlayers)) {
    if (!playersOnWord) {
      continue;
    }
    for (const uid of Object.keys(playersOnWord)) {
      if (!playersOnWord[uid]) {
        continue;
      }
      const list = byPlayer.get(uid);
      if (list) {
        list.push(normalized);
      } else {
        byPlayer.set(uid, [normalized]);
      }
    }
  }
  return byPlayer;
}

/** Ensure own submitted words are present on wordPlayers (for local rejoin cache). */
export function mergeOwnWordsIntoWordPlayers(
  wordPlayers: WordPlayers | undefined,
  uid: string,
  ownWords: ReadonlySet<string> | readonly string[],
): WordPlayers {
  const next: WordPlayers = { ...(wordPlayers ?? {}) };
  for (const normalized of ownWords) {
    if (!normalized) {
      continue;
    }
    next[normalized] = { ...(next[normalized] ?? {}), [uid]: true };
  }
  return next;
}

/** Union two wordPlayers maps (uid leaves). */
export function mergeWordPlayersMaps(
  a: WordPlayers | undefined,
  b: WordPlayers | undefined,
): WordPlayers {
  const out: WordPlayers = { ...(a ?? {}) };
  for (const [normalized, playersOnWord] of Object.entries(b ?? {})) {
    if (!playersOnWord) {
      continue;
    }
    out[normalized] = { ...(out[normalized] ?? {}), ...playersOnWord };
  }
  return out;
}

/** Reverse invert: player→words → word→players (for caching from liveWords). */
export function wordPlayersFromWordsByPlayer(
  wordsByPlayer: ReadonlyMap<string, readonly string[]>,
): WordPlayers {
  const wordPlayers: WordPlayers = {};
  for (const [uid, words] of wordsByPlayer) {
    for (const normalized of words) {
      if (!normalized) {
        continue;
      }
      wordPlayers[normalized] = { ...(wordPlayers[normalized] ?? {}), [uid]: true };
    }
  }
  return wordPlayers;
}

/**
 * Filter wordPlayers to only the actor's leaves — peers restore their own
 * shards from their caches (own-uid RTDB rules).
 */
export function wordPlayersForUidOnly(
  wordPlayers: WordPlayers | undefined,
  uid: string,
): WordPlayers {
  const out: WordPlayers = {};
  for (const [normalized, playersOnWord] of Object.entries(wordPlayers ?? {})) {
    if (playersOnWord?.[uid] === true) {
      out[normalized] = { [uid]: true };
    }
  }
  return out;
}
