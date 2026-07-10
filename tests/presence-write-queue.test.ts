import { beforeEach, describe, expect, it } from 'vitest';

import {
  beginPresenceWrite,
  isPresenceWriteCurrent,
  resetPresenceWriteQueueForTests,
} from '../lib/online/presence/presence-write-queue.js';

describe('presence-write-queue', () => {
  beforeEach(() => {
    resetPresenceWriteQueueForTests();
  });

  it('keeps a write current until a newer intent starts', () => {
    const gen = beginPresenceWrite('ABCD', 'uid', 'online');
    expect(isPresenceWriteCurrent('ABCD', 'uid', gen, 'online')).toBe(true);
    expect(isPresenceWriteCurrent('ABCD', 'uid', gen, 'offline')).toBe(false);
  });

  it('cancels an in-flight online write when offline starts', () => {
    const onlineGen = beginPresenceWrite('ABCD', 'uid', 'online');
    const offlineGen = beginPresenceWrite('ABCD', 'uid', 'offline');

    expect(isPresenceWriteCurrent('ABCD', 'uid', onlineGen, 'online')).toBe(false);
    expect(isPresenceWriteCurrent('ABCD', 'uid', offlineGen, 'offline')).toBe(true);
  });

  it('isolates players from each other', () => {
    const a = beginPresenceWrite('ABCD', 'a', 'online');
    const b = beginPresenceWrite('ABCD', 'b', 'offline');
    expect(isPresenceWriteCurrent('ABCD', 'a', a, 'online')).toBe(true);
    expect(isPresenceWriteCurrent('ABCD', 'b', b, 'offline')).toBe(true);
  });
});
