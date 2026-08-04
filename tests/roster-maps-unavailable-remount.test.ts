import { describe, expect, it } from 'vitest';

import { shouldPreserveRosterMapsOnUnavailableRemount } from '../lib/online/session/roster-maps-unavailable-remount.js';

describe('shouldPreserveRosterMapsOnUnavailableRemount', () => {
  it('preserves rich SoT even if bootstrap flag is still false', () => {
    expect(
      shouldPreserveRosterMapsOnUnavailableRemount({
        bootstrapComplete: false,
        maps: { wordPlayers: { порт: { org: true } } },
        words: new Map([['org', ['порт']]]),
      }),
    ).toBe(true);
  });

  it('preserves empty only after bootstrap already completed (post-bootstrap remount)', () => {
    expect(
      shouldPreserveRosterMapsOnUnavailableRemount({
        bootstrapComplete: true,
        maps: { wordPlayers: {} },
        words: new Map(),
      }),
    ).toBe(true);
  });

  it('does not preserve incomplete empty (restart fetch on remount)', () => {
    expect(
      shouldPreserveRosterMapsOnUnavailableRemount({
        bootstrapComplete: false,
        maps: { wordPlayers: {} },
        words: new Map(),
      }),
    ).toBe(false);
    expect(
      shouldPreserveRosterMapsOnUnavailableRemount({
        bootstrapComplete: false,
        maps: null,
        words: new Map(),
      }),
    ).toBe(false);
  });
});
