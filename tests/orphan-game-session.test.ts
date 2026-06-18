import { describe, expect, it } from 'vitest';

import {
  isOrphanGameSessionShell,
  resolveRematchRtdbPresence,
} from '../lib/online/orphan-game-session.js';

describe('isOrphanGameSessionShell', () => {
  it('detects leftover presence-only session nodes', () => {
    expect(
      isOrphanGameSessionShell({
        players: { a: { online: false } },
      }),
    ).toBe(true);
  });

  it('ignores valid finished sessions', () => {
    expect(
      isOrphanGameSessionShell({
        status: 'finished',
        organizerId: 'org',
        players: { a: { online: false } },
      }),
    ).toBe(false);
  });
});

describe('resolveRematchRtdbPresence', () => {
  it('treats orphan shells as missing', () => {
    expect(
      resolveRematchRtdbPresence({
        players: { mom: { online: false } },
      }),
    ).toBe('missing');
  });

  it('reads normal session statuses', () => {
    expect(
      resolveRematchRtdbPresence({
        status: 'finished',
        organizerId: 'org',
        players: {},
      }),
    ).toBe('finished');
  });
});
