import { describe, expect, it } from 'vitest';

import {
  shouldMarkPresenceOffline,
  shouldMarkPresenceOnline,
} from '../lib/online/presence/app-presence-state.js';

describe('app-presence-state', () => {
  it('marks offline on background and inactive by default (play / lock screen)', () => {
    expect(shouldMarkPresenceOffline('background')).toBe(true);
    expect(shouldMarkPresenceOffline('inactive')).toBe(true);
    expect(shouldMarkPresenceOffline('active')).toBe(false);
  });

  it('lobby waiting policy ignores inactive (multi-sim focus) but still uses background', () => {
    expect(shouldMarkPresenceOffline('background', 'background-only')).toBe(true);
    expect(shouldMarkPresenceOffline('inactive', 'background-only')).toBe(false);
    expect(shouldMarkPresenceOffline('active', 'background-only')).toBe(false);
  });

  it('marks online / allows reconnect and reconcile only while active', () => {
    expect(shouldMarkPresenceOnline('active')).toBe(true);
    expect(shouldMarkPresenceOnline('background')).toBe(false);
    expect(shouldMarkPresenceOnline('inactive')).toBe(false);
  });
});
