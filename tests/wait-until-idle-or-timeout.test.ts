import { describe, expect, it } from 'vitest';

import { waitUntilIdleOrTimeout } from '../lib/online/wait-until-idle-or-timeout.js';

describe('waitUntilIdleOrTimeout', () => {
  it('returns idle immediately when already idle', async () => {
    await expect(waitUntilIdleOrTimeout(() => true, 1_000)).resolves.toBe('idle');
  });

  it('returns idle after the predicate flips', async () => {
    let idle = false;
    setTimeout(() => {
      idle = true;
    }, 30);
    await expect(waitUntilIdleOrTimeout(() => idle, 500, 10)).resolves.toBe('idle');
  });

  it('returns timeout when still busy past the deadline', async () => {
    await expect(waitUntilIdleOrTimeout(() => false, 40, 10)).resolves.toBe('timeout');
  });
});
