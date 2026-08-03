import { describe, expect, it } from 'vitest';

import {
  applyWordSubmitToWordMaps,
  applyWordSubmitToWordPlayersShard,
  buildPartialWordMaps,
} from '../lib/online/apply-word-submit-to-session.js';

describe('applyWordSubmitToWordPlayersShard', () => {
  it('scores first unique word with x2 when bonus is on', () => {
    const result = applyWordSubmitToWordPlayersShard(null, 'p1', 'порт', true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.prevGlobal).toBe(0);
    expect(result.entry.points).toBe(2);
    expect(result.maps.wordPlayers?.порт?.p1).toBe(true);
  });

  it('rejects duplicate submission from same player', () => {
    const result = applyWordSubmitToWordPlayersShard({ p1: true }, 'p1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'DUPLICATE' });
  });

  it('marks overlap on second player', () => {
    const first = applyWordSubmitToWordPlayersShard(null, 'p1', 'порт', true);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = applyWordSubmitToWordPlayersShard(
      first.maps.wordPlayers?.порт ?? null,
      'p2',
      'порт',
      true,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.prevGlobal).toBe(1);
    expect(second.entry.points).toBe(1);
    expect(second.entry.kind).toBe('normal');
  });

  it('ignores false leaves when counting overlap on shard submit', () => {
    const result = applyWordSubmitToWordPlayersShard(
      { ghost: false as unknown as true },
      'p1',
      'порт',
      true,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.prevGlobal).toBe(0);
    expect(result.entry.kind).toBe('unique');
    expect(result.entry.points).toBe(2);
  });
});

describe('buildPartialWordMaps', () => {
  it('builds wordPlayers shard for one word', () => {
    expect(buildPartialWordMaps('порт', { p1: true })).toEqual({
      wordPlayers: { порт: { p1: true } },
    });
  });
});

describe('applyWordSubmitToWordMaps', () => {
  it('returns prevGlobal for full-tree helper', () => {
    const result = applyWordSubmitToWordMaps({}, 'p1', 'порт', true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.prevGlobal).toBe(0);
  });
});
