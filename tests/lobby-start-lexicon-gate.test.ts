import { describe, expect, it } from 'vitest';

import { shouldDisableLobbyStartForLexicon } from '@/lib/online/lobby-start-lexicon-gate';

describe('shouldDisableLobbyStartForLexicon', () => {
  it('does not block start when a lexicon is already available', () => {
    expect(shouldDisableLobbyStartForLexicon(true, true)).toBe(false);
    expect(shouldDisableLobbyStartForLexicon(false, true)).toBe(false);
  });

  it('blocks start only while loading with no lexicon yet', () => {
    expect(shouldDisableLobbyStartForLexicon(true, false)).toBe(true);
    expect(shouldDisableLobbyStartForLexicon(false, false)).toBe(false);
  });
});
