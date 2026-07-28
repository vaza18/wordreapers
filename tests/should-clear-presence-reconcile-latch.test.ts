import { describe, expect, it } from 'vitest';

import {
  PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS,
  shouldClearPresenceReconcileLatch,
} from '../lib/online/presence/should-clear-presence-reconcile-latch.js';

describe('shouldClearPresenceReconcileLatch', () => {
  it('does not clear when latch is for a different round', () => {
    expect(
      shouldClearPresenceReconcileLatch({
        latchedRoundKey: '1:100',
        roundKey: '2:200',
        playerOnline: false,
        sawOnlineSinceLatch: true,
      }),
    ).toBe(false);
  });

  it('does not clear while the player is still online after a successful reconcile', () => {
    expect(
      shouldClearPresenceReconcileLatch({
        latchedRoundKey: '1:100',
        roundKey: '1:100',
        playerOnline: true,
        sawOnlineSinceLatch: true,
      }),
    ).toBe(false);
  });

  it('does not clear on repeated offline snapshots before any online was seen (within cooldown)', () => {
    expect(
      shouldClearPresenceReconcileLatch({
        latchedRoundKey: '1:100',
        roundKey: '1:100',
        playerOnline: false,
        sawOnlineSinceLatch: false,
        msSinceLatch: 500,
      }),
    ).toBe(false);
  });

  it('clears once when online flips to offline after a successful latch', () => {
    expect(
      shouldClearPresenceReconcileLatch({
        latchedRoundKey: '1:100',
        roundKey: '1:100',
        playerOnline: false,
        sawOnlineSinceLatch: true,
      }),
    ).toBe(true);
  });

  it('clears after stuck-offline cooldown when reconcile never saw online in session', () => {
    expect(
      shouldClearPresenceReconcileLatch({
        latchedRoundKey: '1:100',
        roundKey: '1:100',
        playerOnline: false,
        sawOnlineSinceLatch: false,
        msSinceLatch: PRESENCE_RECONCILE_STUCK_OFFLINE_RETRY_MS,
      }),
    ).toBe(true);
  });
});
