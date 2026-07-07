import { describe, expect, it, vi } from 'vitest';

import { loadFrozenRoundWithRetry } from '../lib/online/session/load-frozen-round-with-retry.js';

describe('loadFrozenRoundWithRetry', () => {
  it('returns the first successful snapshot', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ session: { baseWordRound: 1 }, words: new Map() });

    const result = await loadFrozenRoundWithRetry(loader, { attempts: 3, delayMs: 0 });
    expect(result).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('returns null after exhausting attempts', async () => {
    const loader = vi.fn().mockResolvedValue(null);
    const result = await loadFrozenRoundWithRetry(loader, { attempts: 2, delayMs: 0 });
    expect(result).toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
