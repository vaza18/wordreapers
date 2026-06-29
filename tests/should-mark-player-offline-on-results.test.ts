import { describe, expect, it } from 'vitest';

import { resolveResultsPresence } from '../lib/online/live-round-screen-actions.js';

describe('resolveResultsPresence', () => {
  it('marks offline when viewing archive only', () => {
    expect(resolveResultsPresence({ liveSession: null, frozenBaseWordRound: 1 })).toBe(true);
  });

  it('marks offline when frozen round is older than live', () => {
    expect(
      resolveResultsPresence({
        liveSession: { status: 'playing', baseWordRound: 2 },
        frozenBaseWordRound: 1,
      }),
    ).toBe(true);
  });

  it('does not mark offline when live is playing and frozen matches intent to stay online', () => {
    expect(
      resolveResultsPresence({
        liveSession: { status: 'playing', baseWordRound: 2 },
        frozenBaseWordRound: 2,
      }),
    ).toBe(false);
  });
});
