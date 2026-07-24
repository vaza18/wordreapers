import { describe, expect, it } from 'vitest';

import { lobbyPresenceOfflinePolicy } from '../lib/online/presence/lobby-presence-policy.js';

describe('lobbyPresenceOfflinePolicy', () => {
  it('is always background-only (stable across waiting → playing)', () => {
    expect(lobbyPresenceOfflinePolicy()).toBe('background-only');
  });
});
