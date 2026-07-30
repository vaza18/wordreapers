import { describe, expect, it, vi } from 'vitest';

import { ensureAppCheckWithRetry } from '../lib/firebase/ensure-app-check-with-retry.js';

describe('ensureAppCheckWithRetry', () => {
  it('returns true on first success', async () => {
    const ensure = vi.fn().mockResolvedValue(undefined);
    await expect(ensureAppCheckWithRetry(ensure, { delaysMs: [0, 0] })).resolves.toBe(true);
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('retries after failure then succeeds', async () => {
    const ensure = vi
      .fn()
      .mockRejectedValueOnce(new Error('APP_CHECK_TOKEN_EMPTY'))
      .mockResolvedValueOnce(undefined);
    const onAttemptError = vi.fn();

    await expect(
      ensureAppCheckWithRetry(ensure, { delaysMs: [0, 0], onAttemptError }),
    ).resolves.toBe(true);
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(onAttemptError).toHaveBeenCalledTimes(1);
  });

  it('returns false when every attempt fails', async () => {
    const ensure = vi.fn().mockRejectedValue(new Error('APP_CHECK_TOKEN_EMPTY'));

    await expect(ensureAppCheckWithRetry(ensure, { delaysMs: [0, 0, 0] })).resolves.toBe(false);
    expect(ensure).toHaveBeenCalledTimes(3);
  });
});
