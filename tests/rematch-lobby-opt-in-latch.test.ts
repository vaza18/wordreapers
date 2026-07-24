import { describe, expect, it } from 'vitest';

import { shouldLatchRematchLobbyOptIn } from '../lib/online/session/rematch-lobby-opt-in-latch.js';

describe('shouldLatchRematchLobbyOptIn', () => {
  it('latches on justOptedIn or RTDB online / resultsExitedBy', () => {
    expect(
      shouldLatchRematchLobbyOptIn({
        session: null,
        myUid: 'a',
        justOptedIn: true,
      }),
    ).toBe(true);
    expect(
      shouldLatchRematchLobbyOptIn({
        session: {
          players: { a: { name: 'A', wordCount: 0, score: 0, online: true } },
        },
        myUid: 'a',
      }),
    ).toBe(true);
    expect(
      shouldLatchRematchLobbyOptIn({
        session: {
          resultsExitedBy: { a: true },
          players: { a: { name: 'A', wordCount: 0, score: 0, online: false } },
        },
        myUid: 'a',
      }),
    ).toBe(true);
  });

  it('does not latch for offline roster without opt-in evidence', () => {
    expect(
      shouldLatchRematchLobbyOptIn({
        session: {
          players: { a: { name: 'A', wordCount: 0, score: 0, online: false } },
        },
        myUid: 'a',
      }),
    ).toBe(false);
  });
});
