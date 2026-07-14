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
    const gen = beginPresenceWrite('ABCDE', 'uid', 'online');
    expect(isPresenceWriteCurrent('ABCDE', 'uid', gen, 'online')).toBe(true);
    expect(isPresenceWriteCurrent('ABCDE', 'uid', gen, 'offline')).toBe(false);
  });

  it('cancels an in-flight online write when offline starts', () => {
    const onlineGen = beginPresenceWrite('ABCDE', 'uid', 'online');
    const offlineGen = beginPresenceWrite('ABCDE', 'uid', 'offline');

    expect(isPresenceWriteCurrent('ABCDE', 'uid', onlineGen, 'online')).toBe(false);
    expect(isPresenceWriteCurrent('ABCDE', 'uid', offlineGen, 'offline')).toBe(true);
  });

  it('isolates players from each other', () => {
    const a = beginPresenceWrite('ABCDE', 'a', 'online');
    const b = beginPresenceWrite('ABCDE', 'b', 'offline');
    expect(isPresenceWriteCurrent('ABCDE', 'a', a, 'online')).toBe(true);
    expect(isPresenceWriteCurrent('ABCDE', 'b', b, 'offline')).toBe(true);
  });
});
