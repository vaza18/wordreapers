import { describe, expect, it } from 'vitest';

import { buildSoloWordListDisplay } from '@/lib/game/solo-word-list-display';

describe('buildSoloWordListDisplay', () => {
  it('maps solo words to scored entries and display strings in insertion order', () => {
    const words = [
      {
        normalized: 'кіт',
        display: 'КІТ',
        kind: 'unique' as const,
        points: 2,
        badge: 'x2' as const,
        at: 1,
      },
      {
        normalized: 'так',
        display: 'ТАК',
        kind: 'normal' as const,
        points: 1,
        badge: null,
        at: 2,
      },
    ];

    const { entries, displays } = buildSoloWordListDisplay(words);

    expect(displays).toEqual(['КІТ', 'ТАК']);
    expect(entries).toEqual([
      { normalized: 'кіт', kind: 'unique', points: 2, badge: 'x2' },
      { normalized: 'так', kind: 'normal', points: 1, badge: null },
    ]);
  });

  it('returns empty arrays for an empty word list', () => {
    expect(buildSoloWordListDisplay([])).toEqual({ entries: [], displays: [] });
  });
});
