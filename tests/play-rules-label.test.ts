import { describe, expect, it } from 'vitest';

import {
  formatPlayRulesLabel,
  formatResultsLexiconOptionsSuffix,
} from '../lib/online/play-rules-label.js';

const t = (key: string) => key;

describe('formatResultsLexiconOptionsSuffix', () => {
  it('returns null when both options are off', () => {
    expect(
      formatResultsLexiconOptionsSuffix(t, { allowProperNouns: false, allowSlang: false }),
    ).toBe(null);
    expect(formatResultsLexiconOptionsSuffix(t, null)).toBeNull();
  });

  it('returns proper nouns only', () => {
    expect(
      formatResultsLexiconOptionsSuffix(t, { allowProperNouns: true, allowSlang: false }),
    ).toBe('online.playRulesProper');
  });

  it('returns slang only', () => {
    expect(
      formatResultsLexiconOptionsSuffix(t, { allowProperNouns: false, allowSlang: true }),
    ).toBe('online.playRulesSlang');
  });

  it('returns combined label when both are on', () => {
    expect(formatResultsLexiconOptionsSuffix(t, { allowProperNouns: true, allowSlang: true })).toBe(
      'online.playRulesProperAndSlang',
    );
  });
});

describe('formatPlayRulesLabel', () => {
  it('still returns standard label when both options are off', () => {
    expect(formatPlayRulesLabel(t, null)).toBe('online.playRulesStandard');
  });
});
