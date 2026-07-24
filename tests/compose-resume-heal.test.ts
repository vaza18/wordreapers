import { describe, expect, it } from 'vitest';

import {
  shouldHealPlayUiOnAppState,
  shouldReplaceOwnWordsFromResumeSnapshot,
} from '@/lib/game/compose-resume-heal';

describe('shouldHealPlayUiOnAppState', () => {
  it('heals only on foreground active', () => {
    expect(shouldHealPlayUiOnAppState('active')).toBe(true);
    expect(shouldHealPlayUiOnAppState('inactive')).toBe(false);
    expect(shouldHealPlayUiOnAppState('background')).toBe(false);
  });
});

describe('shouldReplaceOwnWordsFromResumeSnapshot', () => {
  it('replaces when remote has more words than local', () => {
    expect(
      shouldReplaceOwnWordsFromResumeSnapshot({
        localNormalized: new Set(['kino', 're']),
        remoteNormalized: new Set(['kino', 're', 'ton']),
      }),
    ).toBe(true);
  });

  it('replaces when remote has a key local is missing (same size)', () => {
    expect(
      shouldReplaceOwnWordsFromResumeSnapshot({
        localNormalized: new Set(['kino', 're']),
        remoteNormalized: new Set(['kino', 'ton']),
      }),
    ).toBe(true);
  });

  it('keeps local when remote is equal or a subset', () => {
    expect(
      shouldReplaceOwnWordsFromResumeSnapshot({
        localNormalized: new Set(['kino', 're']),
        remoteNormalized: new Set(['kino', 're']),
      }),
    ).toBe(false);
    expect(
      shouldReplaceOwnWordsFromResumeSnapshot({
        localNormalized: new Set(['kino', 're', 'ton']),
        remoteNormalized: new Set(['kino', 're']),
      }),
    ).toBe(false);
  });
});
