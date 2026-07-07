import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const removeMock = vi.fn();
const onValueMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  onValue: (...args: unknown[]) => onValueMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

import {
  clearPlayerWords,
  subscribePlayerWords,
  subscribeSessionPlayerWords,
} from '../lib/firebase/player-words-service.js';

describe('player-words-service subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeMock.mockResolvedValue(undefined);
  });

  it('clears a player word node', async () => {
    await clearPlayerWords('abcd', 'org');

    expect(removeMock).toHaveBeenCalledWith({
      path: 'player_words/ABCD/org',
    });
  });

  it('subscribes to one player words node', () => {
    const listener = vi.fn();
    onValueMock.mockImplementation(() => vi.fn());

    subscribePlayerWords('ABCD', 'org', listener);

    const onNext = onValueMock.mock.calls[0]?.[1] as (snapshot: {
      exists: () => boolean;
      val: () => unknown;
    }) => void;
    onNext({
      exists: () => true,
      val: () => ({ порт: { display: 'порт', at: 1 } }),
    });

    expect(listener).toHaveBeenCalledWith(expect.any(Map));
    expect(listener.mock.calls[0][0].get('порт')).toEqual({ display: 'порт', at: 1 });
  });

  it('merges session player word subscriptions', () => {
    const listener = vi.fn();
    const listeners: Array<(snapshot: { exists: () => boolean; val: () => unknown }) => void> = [];
    onValueMock.mockImplementation((_ref, onNext) => {
      listeners.push(onNext);
      return vi.fn();
    });

    const unsub = subscribeSessionPlayerWords('ABCD', ['org', 'guest'], listener);

    listeners[0]?.({ exists: () => true, val: () => ({ порт: { display: 'порт', at: 1 } }) });
    listeners[1]?.({ exists: () => false, val: () => null });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0].get('org')?.get('порт')).toEqual({
      display: 'порт',
      at: 1,
    });
    expect(unsub).not.toThrow();
  });

  it('returns immediately for empty player id lists', () => {
    const listener = vi.fn();

    subscribeSessionPlayerWords('ABCD', [], listener);

    expect(listener).toHaveBeenCalledWith(new Map());
    expect(onValueMock).not.toHaveBeenCalled();
  });
});
