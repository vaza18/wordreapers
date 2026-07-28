import { describe, expect, it } from 'vitest';

import { formatLobbyBaseWordMetaLine } from '../lib/online/format-lobby-base-word-meta.js';

describe('formatLobbyBaseWordMetaLine', () => {
  it('joins round and chosen-by with a middle-dot separator', () => {
    expect(
      formatLobbyBaseWordMetaLine({
        roundLabel: 'раунд 8',
        chosenByLabel: 'обрало Василь 7',
      }),
    ).toBe('раунд 8 · обрало Василь 7');
  });

  it('returns only chosen-by when round label is absent (first round)', () => {
    expect(
      formatLobbyBaseWordMetaLine({
        roundLabel: null,
        chosenByLabel: 'обрало Василь 7',
      }),
    ).toBe('обрало Василь 7');
  });

  it('treats empty or whitespace round label as absent', () => {
    expect(
      formatLobbyBaseWordMetaLine({
        roundLabel: '   ',
        chosenByLabel: 'обрало Василь 7',
      }),
    ).toBe('обрало Василь 7');
  });
});
