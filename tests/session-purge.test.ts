import { describe, expect, it } from 'vitest';

import {
  FINISHED_RETENTION_MS,
  computePurgeAfterAt,
  withFinishedPurgeFields,
} from '../lib/firebase/session-purge.js';

describe('session-purge', () => {
  it('schedules purge seven days after finish', () => {
    const now = 1_700_000_000_000;
    expect(computePurgeAfterAt(now)).toBe(now + FINISHED_RETENTION_MS);
  });

  it('adds purgeAfterAt when marking session finished', () => {
    const now = 1_700_000_000_000;
    const next = withFinishedPurgeFields(
      {
        baseWord: 'тест',
        status: 'finished',
        timerEndsAt: null,
      },
      now,
    );
    expect(next.status).toBe('finished');
    expect(next.timerEndsAt).toBeNull();
    expect(next.finishedAt).toBe(now);
    expect(next.purgeAfterAt).toBe(now + FINISHED_RETENTION_MS);
  });
});
