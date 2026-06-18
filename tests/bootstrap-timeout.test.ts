import { describe, expect, it, vi } from 'vitest';

import { withBootstrapTimeout } from '@/lib/app/bootstrap-timeout';

describe('withBootstrapTimeout', () => {
  it('resolves with the promise result when it settles in time', async () => {
    await expect(withBootstrapTimeout(Promise.resolve(42), 200, 'fast')).resolves.toBe(42);
  });

  it('returns null when the promise exceeds the timeout', async () => {
    vi.useFakeTimers();
    const pending = new Promise<number>(() => {});
    const resultPromise = withBootstrapTimeout(pending, 100, 'slow');
    await vi.advanceTimersByTimeAsync(100);
    await expect(resultPromise).resolves.toBeNull();
    vi.useRealTimers();
  });
});
