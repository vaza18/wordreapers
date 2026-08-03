import { describe, expect, it } from 'vitest';
import { shouldCompleteWordsBootstrapWithoutFetch } from '../lib/online/session/words-bootstrap-gate';

describe('shouldCompleteWordsBootstrapWithoutFetch', () => {
  it('does not complete when disabled (avoids stale-true empty freeze)', () => {
    expect(
      shouldCompleteWordsBootstrapWithoutFetch({
        enabled: false,
        hasGameId: true,
        rosterLength: 2,
      }),
    ).toBe(false);
  });

  it('completes only for enabled empty-roster listen-only path', () => {
    expect(
      shouldCompleteWordsBootstrapWithoutFetch({
        enabled: true,
        hasGameId: false,
        rosterLength: 2,
      }),
    ).toBe(false);
    expect(
      shouldCompleteWordsBootstrapWithoutFetch({
        enabled: true,
        hasGameId: true,
        rosterLength: 0,
      }),
    ).toBe(true);
  });

  it('does not complete when a fetchable roster is present', () => {
    expect(
      shouldCompleteWordsBootstrapWithoutFetch({
        enabled: true,
        hasGameId: true,
        rosterLength: 1,
      }),
    ).toBe(false);
  });
});
