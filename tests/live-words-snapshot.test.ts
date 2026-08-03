import { describe, expect, it } from 'vitest';

import type { AllPlayerWords } from '../lib/online/session/clone-player-words.js';
import {
  liveWordsSignature,
  shouldReplaceLiveWordMaps,
  shouldReplaceLiveWordsSnapshot,
  totalPlayerWordCount,
  wordPlayersLeafCount,
} from '../lib/online/session/live-words-snapshot.js';

describe('live-words-snapshot', () => {
  it('counts words across players', () => {
    const words: AllPlayerWords = new Map([
      ['org', ['порт', 'рот']],
      ['a', ['порт']],
    ]);
    expect(totalPlayerWordCount(words)).toBe(3);
  });

  it('rejects empty clears but allows non-empty shrink', () => {
    const rich: AllPlayerWords = new Map([['org', ['порт', 'рот']]]);
    const empty: AllPlayerWords = new Map();
    const shrink: AllPlayerWords = new Map([['org', ['порт']]]);

    expect(shouldReplaceLiveWordsSnapshot(rich, empty)).toBe(false);
    expect(shouldReplaceLiveWordsSnapshot(rich, shrink)).toBe(true);
    expect(shouldReplaceLiveWordsSnapshot(empty, rich)).toBe(true);
    expect(shouldReplaceLiveWordsSnapshot(rich, rich)).toBe(true);
  });

  it('builds an order-independent words signature', () => {
    const a: AllPlayerWords = new Map([
      ['b', ['рот', 'порт']],
      ['a', ['порт']],
    ]);
    const b: AllPlayerWords = new Map([
      ['a', ['порт']],
      ['b', ['порт', 'рот']],
    ]);
    expect(liveWordsSignature(a)).toBe(liveWordsSignature(b));
  });

  it('rejects empty map clears but allows non-empty shrink', () => {
    const rich = { wordPlayers: { порт: { org: true }, рот: { a: true } } };
    expect(wordPlayersLeafCount(rich.wordPlayers)).toBe(2);
    expect(shouldReplaceLiveWordMaps(rich, { wordPlayers: {} })).toBe(false);
    expect(shouldReplaceLiveWordMaps(rich, null)).toBe(false);
    expect(shouldReplaceLiveWordMaps(rich, { wordPlayers: { порт: { org: true } } })).toBe(true);
    expect(shouldReplaceLiveWordMaps(null, rich)).toBe(true);
  });
});
