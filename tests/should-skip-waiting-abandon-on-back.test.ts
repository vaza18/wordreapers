import { describe, expect, it } from 'vitest';

import { shouldSkipWaitingAbandonOnBack } from '@/lib/online/should-skip-waiting-abandon-on-back';

describe('shouldSkipWaitingAbandonOnBack', () => {
  it('skips abandon when popping lobby back to setup for the same room', () => {
    expect(
      shouldSkipWaitingAbandonOnBack(
        {
          index: 1,
          routes: [
            { key: 'setup', name: 'setup', params: { gameId: 'ABCDE' } },
            { key: 'lobby', name: 'lobby/[gameId]', params: { gameId: 'ABCDE' } },
          ],
        },
        'ABCDE',
      ),
    ).toBe(true);
  });

  it('does not skip when leaving lobby to a non-setup screen', () => {
    expect(
      shouldSkipWaitingAbandonOnBack(
        {
          index: 1,
          routes: [
            { key: 'join', name: 'join' },
            { key: 'lobby', name: 'lobby/[gameId]', params: { gameId: 'ABCDE' } },
          ],
        },
        'ABCDE',
      ),
    ).toBe(false);
  });
});
