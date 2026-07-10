import { describe, expect, it } from 'vitest';

import {
  shouldMarkPresenceOffline,
  shouldMarkPresenceOnline,
} from '../lib/online/presence/app-presence-state.js';

describe('app-presence-state', () => {
  it('marks offline only on background', () => {
    expect(shouldMarkPresenceOffline('background')).toBe(true);
    expect(shouldMarkPresenceOffline('inactive')).toBe(false);
    expect(shouldMarkPresenceOffline('active')).toBe(false);
  });

  it('marks online / allows reconnect and reconcile only while active', () => {
    expect(shouldMarkPresenceOnline('active')).toBe(true);
    expect(shouldMarkPresenceOnline('background')).toBe(false);
    expect(shouldMarkPresenceOnline('inactive')).toBe(false);
  });
});
