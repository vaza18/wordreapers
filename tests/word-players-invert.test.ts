import { describe, expect, it } from 'vitest';

import {
  mergeOwnWordsIntoWordPlayers,
  mergeWordPlayersMaps,
  normalizedWordsForUid,
  sameStringSet,
  wordPlayersForUidOnly,
  wordPlayersFromWordsByPlayer,
  wordsByPlayerFromWordPlayers,
} from '@/lib/online/word-players-invert';

describe('normalizedWordsForUid', () => {
  it('returns empty for empty maps', () => {
    expect(normalizedWordsForUid(undefined, 'a')).toEqual([]);
    expect(normalizedWordsForUid({}, 'a')).toEqual([]);
  });

  it('returns only words where uid is present', () => {
    const wordPlayers = {
      порт: { a: true, b: true },
      рот: { b: true },
      тор: { a: true },
    };
    expect(normalizedWordsForUid(wordPlayers, 'a').sort()).toEqual(['порт', 'тор']);
    expect(normalizedWordsForUid(wordPlayers, 'b').sort()).toEqual(['порт', 'рот']);
    expect(normalizedWordsForUid(wordPlayers, 'c')).toEqual([]);
  });
});

describe('wordPlayersForUidOnly', () => {
  it('keeps only the actor leaf on each word', () => {
    expect(
      wordPlayersForUidOnly({ порт: { org: true, peer: true }, рот: { peer: true } }, 'org'),
    ).toEqual({ порт: { org: true } });
  });
});

describe('sameStringSet', () => {
  it('compares membership ignoring order', () => {
    expect(sameStringSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
    expect(sameStringSet(new Set(['a']), new Set(['a', 'b']))).toBe(false);
    expect(sameStringSet(new Set(), new Set())).toBe(true);
  });
});

describe('mergeOwnWordsIntoWordPlayers', () => {
  it('adds missing own words without dropping peers on shared words', () => {
    expect(
      mergeOwnWordsIntoWordPlayers({ порт: { org: true, a: true } }, 'org', ['порт', 'рот']),
    ).toEqual({
      порт: { org: true, a: true },
      рот: { org: true },
    });
  });
});

describe('mergeWordPlayersMaps', () => {
  it('unions uid leaves across maps', () => {
    expect(
      mergeWordPlayersMaps({ порт: { org: true }, рот: { a: true } }, { порт: { a: true } }),
    ).toEqual({
      порт: { org: true, a: true },
      рот: { a: true },
    });
  });
});

describe('wordPlayersFromWordsByPlayer', () => {
  it('reverse-inverts player word lists', () => {
    expect(
      wordPlayersFromWordsByPlayer(
        new Map([
          ['org', ['порт', 'рот']],
          ['a', ['порт']],
        ]),
      ),
    ).toEqual({
      порт: { org: true, a: true },
      рот: { org: true },
    });
  });
});

describe('wordsByPlayerFromWordPlayers', () => {
  it('inverts word→players into player→words', () => {
    const wordPlayers = {
      порт: { a: true, b: true },
      рот: { b: true },
    };
    const byPlayer = wordsByPlayerFromWordPlayers(wordPlayers);
    expect([...byPlayer.get('a')!].sort()).toEqual(['порт']);
    expect([...byPlayer.get('b')!].sort()).toEqual(['порт', 'рот']);
    expect(byPlayer.has('c')).toBe(false);
  });

  it('returns empty map for empty input', () => {
    expect(wordsByPlayerFromWordPlayers(undefined).size).toBe(0);
    expect(wordsByPlayerFromWordPlayers({}).size).toBe(0);
  });
});
