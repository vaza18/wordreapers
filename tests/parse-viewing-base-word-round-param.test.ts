import { describe, expect, it } from 'vitest';

import { parseViewingBaseWordRoundParam } from '../lib/online/parse-viewing-base-word-round-param.js';

describe('parseViewingBaseWordRoundParam', () => {
  it('parses a non-negative integer', () => {
    expect(parseViewingBaseWordRoundParam('0')).toBe(0);
    expect(parseViewingBaseWordRoundParam('2')).toBe(2);
  });

  it('returns null for missing or invalid values', () => {
    expect(parseViewingBaseWordRoundParam(undefined)).toBeNull();
    expect(parseViewingBaseWordRoundParam('')).toBeNull();
    expect(parseViewingBaseWordRoundParam('-1')).toBeNull();
    expect(parseViewingBaseWordRoundParam('x')).toBeNull();
  });
});
