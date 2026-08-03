import type { SessionWordMaps } from '../../firebase/types.js';
import { compareUk } from '../../i18n/uk-collator.js';
import type { AllPlayerWords } from './clone-player-words.js';

/** Total normalized words across all players in an inverted snapshot. */
export function totalPlayerWordCount(words: AllPlayerWords): number {
  let total = 0;
  for (const list of words.values()) {
    total += list.length;
  }
  return total;
}

/**
 * Block rematch/clear empties from wiping finished-round words before freeze.
 * Room-scoped: callers clear state on `gameId` / disable.
 * Non-empty shrinks are allowed (rare rollback / correction) so UI cannot ghost words.
 */
export function shouldReplaceLiveWordsSnapshot(
  previous: AllPlayerWords,
  next: AllPlayerWords,
): boolean {
  const prevCount = totalPlayerWordCount(previous);
  const nextCount = totalPlayerWordCount(next);
  if (prevCount > 0 && nextCount === 0) {
    return false;
  }
  return true;
}

/** Stable membership signature (order-independent) for skip-equal setState. */
export function liveWordsSignature(words: AllPlayerWords): string {
  const parts: string[] = [];
  for (const [uid, list] of [...words.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${uid}:${[...list].sort(compareUk).join(',')}`);
  }
  return parts.join('|');
}

/** Count uid leaves under wordPlayers (for maps richness). */
export function wordPlayersLeafCount(
  wordPlayers: SessionWordMaps['wordPlayers'] | null | undefined,
): number {
  if (!wordPlayers) {
    return 0;
  }
  let total = 0;
  for (const playersOnWord of Object.values(wordPlayers)) {
    if (!playersOnWord) {
      continue;
    }
    for (const present of Object.values(playersOnWord)) {
      if (present) {
        total += 1;
      }
    }
  }
  return total;
}

/** Block empty/null map clears while a non-empty snapshot is held; allow non-empty shrink. */
export function shouldReplaceLiveWordMaps(
  previous: SessionWordMaps | null,
  next: SessionWordMaps | null,
): boolean {
  const prevCount = wordPlayersLeafCount(previous?.wordPlayers);
  const nextCount = wordPlayersLeafCount(next?.wordPlayers);
  if (prevCount > 0 && nextCount === 0) {
    return false;
  }
  return true;
}

/** Stable maps signature for skip-equal setState. */
export function liveWordMapsSignature(maps: SessionWordMaps | null): string {
  if (!maps?.wordPlayers) {
    return '';
  }
  const parts: string[] = [];
  for (const [word, players] of Object.entries(maps.wordPlayers).sort(([a], [b]) =>
    compareUk(a, b),
  )) {
    if (!players) {
      continue;
    }
    const uids = Object.keys(players)
      .filter((uid) => players[uid])
      .sort();
    if (uids.length > 0) {
      parts.push(`${word}:${uids.join(',')}`);
    }
  }
  return parts.join('|');
}
