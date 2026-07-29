import { describe, expect, it } from 'vitest';

import {
  FINISH_RETRY_BACKOFF_CAP_MS,
  finishRetryBackoffMs,
} from '../lib/online/play-expire-finish-schedule.js';

describe('finishRetryBackoffMs', () => {
  it('starts at 1s and doubles until cap', () => {
    expect(finishRetryBackoffMs(1)).toBe(1000);
    expect(finishRetryBackoffMs(2)).toBe(2000);
    expect(finishRetryBackoffMs(3)).toBe(4000);
    expect(finishRetryBackoffMs(4)).toBe(FINISH_RETRY_BACKOFF_CAP_MS);
    expect(finishRetryBackoffMs(10)).toBe(FINISH_RETRY_BACKOFF_CAP_MS);
  });

  it('treats zero/negative fails as first retry delay', () => {
    expect(finishRetryBackoffMs(0)).toBe(1000);
  });
});
