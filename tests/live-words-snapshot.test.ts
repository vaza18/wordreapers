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

  it('default empty-clear-guard blocks only empty clears, not non-empty shrink', () => {
    const rich: AllPlayerWords = new Map([['org', ['порт', 'рот']]]);
    const empty: AllPlayerWords = new Map();
    const shrink: AllPlayerWords = new Map([['org', ['порт']]]);

    expect(shouldReplaceLiveWordsSnapshot(rich, empty)).toBe(false);
    expect(shouldReplaceLiveWordsSnapshot(rich, shrink)).toBe(true);
    expect(shouldReplaceLiveWordsSnapshot(empty, rich)).toBe(true);
    expect(shouldReplaceLiveWordsSnapshot(rich, rich)).toBe(true);
  });

  it('grow-only rejects empty clears and non-empty shrinks', () => {
    const rich: AllPlayerWords = new Map([['org', ['порт', 'рот']]]);
    const empty: AllPlayerWords = new Map();
    const shrink: AllPlayerWords = new Map([['org', ['порт']]]);

    expect(shouldReplaceLiveWordsSnapshot(rich, empty, { mode: 'grow-only' })).toBe(false);
    expect(shouldReplaceLiveWordsSnapshot(rich, shrink, { mode: 'grow-only' })).toBe(false);
    expect(shouldReplaceLiveWordsSnapshot(empty, rich, { mode: 'grow-only' })).toBe(true);
  });

  it('grow-only rejects same-count membership swaps and higher-count missing previous', () => {
    const prevWords: AllPlayerWords = new Map([['org', ['порт']]]);
    const swapSameCount: AllPlayerWords = new Map([['org', ['рот']]]);
    const richerMissingPrev: AllPlayerWords = new Map([
      ['org', ['рот']],
      ['guest', ['ретро']],
    ]);
    const richerKeepingPrev: AllPlayerWords = new Map([
      ['org', ['порт', 'рот']],
      ['guest', ['ретро']],
    ]);

    expect(shouldReplaceLiveWordsSnapshot(prevWords, swapSameCount, { mode: 'grow-only' })).toBe(
      false,
    );
    expect(
      shouldReplaceLiveWordsSnapshot(prevWords, richerMissingPrev, { mode: 'grow-only' }),
    ).toBe(false);
    expect(
      shouldReplaceLiveWordsSnapshot(prevWords, richerKeepingPrev, { mode: 'grow-only' }),
    ).toBe(true);

    const prevMaps = { wordPlayers: { порт: { org: true } } };
    expect(
      shouldReplaceLiveWordMaps(
        prevMaps,
        { wordPlayers: { рот: { org: true } } },
        { mode: 'grow-only' },
      ),
    ).toBe(false);
    expect(
      shouldReplaceLiveWordMaps(
        prevMaps,
        { wordPlayers: { рот: { org: true }, ретро: { guest: true } } },
        { mode: 'grow-only' },
      ),
    ).toBe(false);
    expect(
      shouldReplaceLiveWordMaps(
        prevMaps,
        {
          wordPlayers: { порт: { org: true }, рот: { org: true }, ретро: { guest: true } },
        },
        { mode: 'grow-only' },
      ),
    ).toBe(true);
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

  it('default maps guard blocks empty/null only', () => {
    const rich = { wordPlayers: { порт: { org: true }, рот: { a: true } } };
    expect(wordPlayersLeafCount(rich.wordPlayers)).toBe(2);
    expect(shouldReplaceLiveWordMaps(rich, { wordPlayers: {} })).toBe(false);
    expect(shouldReplaceLiveWordMaps(rich, null)).toBe(false);
    expect(shouldReplaceLiveWordMaps(rich, { wordPlayers: { порт: { org: true } } })).toBe(true);
    expect(shouldReplaceLiveWordMaps(null, rich)).toBe(true);
  });

  it('grow-only maps reject leaf shrinks', () => {
    const rich = { wordPlayers: { порт: { org: true }, рот: { a: true } } };
    expect(
      shouldReplaceLiveWordMaps(
        rich,
        { wordPlayers: { порт: { org: true } } },
        { mode: 'grow-only' },
      ),
    ).toBe(false);
    expect(
      shouldReplaceLiveWordMaps(
        rich,
        {
          wordPlayers: { порт: { org: true }, рот: { a: true }, тор: { org: true } },
        },
        { mode: 'grow-only' },
      ),
    ).toBe(true);
  });

  it('after consumer reset to null, smaller post-wipe maps apply', () => {
    const finished = {
      wordPlayers: { порт: { org: true }, рот: { a: true }, тор: { org: true } },
    };
    const nextRoundSmaller = { wordPlayers: { порт: { org: true } } };
    expect(shouldReplaceLiveWordMaps(finished, nextRoundSmaller, { mode: 'grow-only' })).toBe(
      false,
    );
    expect(shouldReplaceLiveWordMaps(null, nextRoundSmaller)).toBe(true);
    expect(shouldReplaceLiveWordMaps({ wordPlayers: {} }, nextRoundSmaller)).toBe(true);
  });

  it('open mode allows mid-wipe shrink to empty', () => {
    const partial = { wordPlayers: { порт: { org: true }, рот: { a: true } } };
    const smaller = { wordPlayers: { порт: { org: true } } };
    expect(shouldReplaceLiveWordMaps(partial, smaller, { mode: 'open' })).toBe(true);
    expect(shouldReplaceLiveWordMaps(smaller, { wordPlayers: {} }, { mode: 'open' })).toBe(true);
    expect(
      shouldReplaceLiveWordsSnapshot(new Map([['org', ['порт', 'рот']]]), new Map(), {
        mode: 'open',
      }),
    ).toBe(true);
  });
});
