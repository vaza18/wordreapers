import { describe, expect, it } from 'vitest';

import {
  consumePresenceHandoff,
  handoffPlayerPresence,
  resetPresenceHandoff,
} from '../lib/online/presence-handoff.js';

describe('presence-handoff', () => {
  it('consumes handoff once for the same room', () => {
    resetPresenceHandoff();
    handoffPlayerPresence('ABCDE');
    expect(consumePresenceHandoff('ABCDE')).toBe(true);
    expect(consumePresenceHandoff('ABCDE')).toBe(false);
  });
});
