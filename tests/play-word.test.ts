import { describe, expect, it } from 'vitest';

import { acceptWord } from '../lib/game/play-word.js';

const deps = {
  hasInDictionary: (word: string) => ['рот', 'тор', 'порт'].includes(word),
};

function baseCtx(overrides: Partial<Parameters<typeof acceptWord>[0]> = {}) {
  return {
    input: 'рот',
    baseWord: 'порт',
    playerId: 'p1',
    uniqueBonusEnabled: false,
    playerWords: new Map<string, readonly string[]>(),
    deps,
    lookupDisplayUpper: () => null,
    ...overrides,
  };
}

describe('acceptWord', () => {
  it('rejects invalid dictionary words', () => {
    const result = acceptWord(baseCtx({ input: 'zzz' }));
    expect(result.accepted).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects duplicate submissions from the same player', () => {
    const playerWords = new Map([['p1', ['рот']]]);
    const result = acceptWord(baseCtx({ playerWords }));
    expect(result).toEqual({
      accepted: false,
      normalized: 'рот',
      error: 'ALREADY_SUBMITTED',
    });
  });

  it('scores unique words as 1 point when bonus is off', () => {
    const result = acceptWord(baseCtx());
    expect(result.accepted).toBe(true);
    expect(result.entry?.kind).toBe('unique');
    expect(result.entry?.points).toBe(1);
    expect(result.entry?.badge).toBeNull();
  });

  it('scores shared words with +1 when bonus is off', () => {
    const playerWords = new Map([['p2', ['рот']]]);
    const result = acceptWord(baseCtx({ playerWords }));
    expect(result.accepted).toBe(true);
    expect(result.entry?.kind).toBe('normal');
    expect(result.entry?.points).toBe(1);
    expect(result.entry?.badge).toBe('+1');
  });

  it('scores unique words as x2 when bonus is on', () => {
    const result = acceptWord(baseCtx({ uniqueBonusEnabled: true }));
    expect(result.entry?.kind).toBe('unique');
    expect(result.entry?.points).toBe(2);
    expect(result.entry?.badge).toBe('x2');
  });

  it('allows duplicate words from multiple players when bonus is on', () => {
    const playerWords = new Map([['p1', ['рот']]]);
    const result = acceptWord(baseCtx({ uniqueBonusEnabled: true, playerId: 'p2', playerWords }));
    expect(result.entry?.kind).toBe('normal');
    expect(result.entry?.points).toBe(1);
    expect(result.entry?.badge).toBe('+1');
  });
});
