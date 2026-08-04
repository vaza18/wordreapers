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
 * How live maps/words snapshots may replace previous state.
 * - `open` — allow any transition (rare; prefer grow-only for finished lists).
 * - `empty-clear-guard` — block only rich→empty/null (default; safe for unknown callers).
 * - `grow-only` — membership-monotonic: every previous leaf/word must remain in next
 *   (ADR-022 rematch N× onChildRemoved / same-count swaps).
 */
export type LiveMapsReplaceMode = 'open' | 'empty-clear-guard' | 'grow-only';

export type LiveMapsReplaceOptions = {
  mode?: LiveMapsReplaceMode;
};

/** True when every previous (word,uid) true-leaf is still true in next. */
export function wordPlayersContainsAllPreviousLeaves(
  previous: SessionWordMaps['wordPlayers'] | null | undefined,
  next: SessionWordMaps['wordPlayers'] | null | undefined,
): boolean {
  if (!previous) {
    return true;
  }
  for (const [word, players] of Object.entries(previous)) {
    if (!players) {
      continue;
    }
    for (const [uid, onWord] of Object.entries(players)) {
      if (onWord === true && next?.[word]?.[uid] !== true) {
        return false;
      }
    }
  }
  return true;
}

/** True when every previous per-player word remains in next. */
export function wordsSnapshotContainsAllPrevious(
  previous: AllPlayerWords,
  next: AllPlayerWords,
): boolean {
  for (const [uid, list] of previous.entries()) {
    const nextList = next.get(uid) ?? [];
    const nextSet = new Set(nextList);
    for (const word of list) {
      if (!nextSet.has(word)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Block rematch/clear empties and (in grow-only) membership shrinks/swaps.
 * Default mode is `empty-clear-guard` — callers that need ADR-022 grow-only must opt in.
 * Play round-reset empty still applies via `decidePlayMapsListenerApply` + awaitingEmptySync.
 */
export function shouldReplaceLiveWordsSnapshot(
  previous: AllPlayerWords,
  next: AllPlayerWords,
  options?: LiveMapsReplaceOptions,
): boolean {
  const mode = options?.mode ?? 'empty-clear-guard';
  if (mode === 'open') {
    return true;
  }
  const prevCount = totalPlayerWordCount(previous);
  const nextCount = totalPlayerWordCount(next);
  if (mode === 'empty-clear-guard') {
    return !(prevCount > 0 && nextCount === 0);
  }
  if (prevCount === 0) {
    return true;
  }
  return wordsSnapshotContainsAllPrevious(previous, next);
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

/**
 * Block empty/null clears and (in grow-only) membership shrinks/swaps.
 * Default `empty-clear-guard` — pass `{ mode: 'grow-only' }` for ADR-022 finished-list freeze.
 */
export function shouldReplaceLiveWordMaps(
  previous: SessionWordMaps | null,
  next: SessionWordMaps | null,
  options?: LiveMapsReplaceOptions,
): boolean {
  const mode = options?.mode ?? 'empty-clear-guard';
  if (mode === 'open') {
    return true;
  }
  const prevCount = wordPlayersLeafCount(previous?.wordPlayers);
  const nextCount = wordPlayersLeafCount(next?.wordPlayers);
  if (mode === 'empty-clear-guard') {
    return !(prevCount > 0 && nextCount === 0);
  }
  if (prevCount === 0) {
    return true;
  }
  return wordPlayersContainsAllPreviousLeaves(previous?.wordPlayers, next?.wordPlayers);
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
