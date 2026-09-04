import { describe, expect, it } from 'vitest';

import { utf8JsonBytes } from '@/lib/debug/rtdb-traffic-probe';
import { deepChangedJsonBytes } from '@/lib/firebase/rtdb-instrumentation';

describe('deepChangedJsonBytes', () => {
  it('counts full tree when previous is undefined', () => {
    const next = { status: 'playing', players: { a: { name: 'A' } } };
    expect(deepChangedJsonBytes(undefined, next)).toBe(utf8JsonBytes(next));
  });

  it('counts only finish leaf keys, not the full players roster', () => {
    const prev = {
      status: 'playing',
      timerEndsAt: 1000,
      players: {
        a: { name: 'Alice', online: true },
        b: { name: 'Bob', online: true },
      },
      baseWord: 'літо',
    };
    const next = {
      ...prev,
      status: 'finished',
      timerEndsAt: null,
      finishedAt: 1000,
    };
    const bytes = deepChangedJsonBytes(prev, next);
    expect(bytes).toBeLessThan(200);
    expect(bytes).toBeGreaterThan(0);
  });

  it('counts only the nested presence leaf when online flips', () => {
    const prev = {
      status: 'finished',
      players: {
        a: { name: 'Alice', online: true },
        b: { name: 'Bob', online: true },
      },
    };
    const next = {
      status: 'finished',
      players: {
        a: { name: 'Alice', online: false },
        b: { name: 'Bob', online: true },
      },
    };
    const bytes = deepChangedJsonBytes(prev, next);
    // Must not bill the entire players map (names + both uids).
    expect(bytes).toBeLessThan(utf8JsonBytes(next.players) / 2);
    expect(bytes).toBeGreaterThan(0);
  });

  it('counts zero when nothing changed', () => {
    const tree = { status: 'playing', x: 1 };
    expect(deepChangedJsonBytes(tree, { ...tree })).toBe(0);
  });
});
