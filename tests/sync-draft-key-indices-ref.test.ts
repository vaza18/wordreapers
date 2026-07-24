import { describe, expect, it } from 'vitest';

import { syncDraftKeyIndicesRef } from '../lib/game/sync-draft-key-indices-ref.js';

describe('syncDraftKeyIndicesRef', () => {
  it('replaces a stale used-key list so accepted letters are free again', () => {
    const ref = { current: [0, 3] }; // e.g. П and І still marked after accept
    const next = syncDraftKeyIndicesRef(ref, []);
    expect(next).toEqual([]);
    expect(ref.current).toEqual([]);

    // Simulate typing Т then О after accept — must not keep П/І indices.
    syncDraftKeyIndicesRef(ref, [5]);
    syncDraftKeyIndicesRef(ref, [5, 7]);
    expect(ref.current).toEqual([5, 7]);
    expect(ref.current.includes(0)).toBe(false);
  });

  it('restores saved indices on submit rollback', () => {
    const ref = { current: [] };
    const saved = [0, 3, 5];
    syncDraftKeyIndicesRef(ref, saved);
    expect(ref.current).toEqual([0, 3, 5]);
    expect(ref.current).not.toBe(saved);
  });
});
