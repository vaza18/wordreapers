import { describe, expect, it } from 'vitest';

import {
  rowMatchesDraftPrefix,
  shouldSkipWordListRowRerender,
  type WordListRowMemoProps,
} from '../lib/ui/word-list-row-memo.js';

const stableStyles = {};
const stableNotebookRow = {};

function rowProps(overrides: Partial<WordListRowMemoProps> = {}): WordListRowMemoProps {
  return {
    row: { entry: { normalized: 'абетка' }, display: 'АБЕТКА' },
    prefix: '',
    showScoreBadges: false,
    showOverlapPeers: true,
    styles: stableStyles,
    notebookRow: stableNotebookRow,
    animateEntrance: false,
    ...overrides,
  };
}

describe('rowMatchesDraftPrefix', () => {
  it('is false for an empty prefix', () => {
    expect(rowMatchesDraftPrefix('абетка', '')).toBe(false);
  });

  it('is true when the normalized word starts with the prefix', () => {
    expect(rowMatchesDraftPrefix('абетка', 'аб')).toBe(true);
  });
});

describe('shouldSkipWordListRowRerender', () => {
  it('skips re-render when prefix changes but the row does not match', () => {
    const row = { entry: { normalized: 'вода' }, display: 'ВОДА' };
    const prev = rowProps({ row, prefix: 'а' });
    const next = rowProps({ row, prefix: 'аб' });
    expect(shouldSkipWordListRowRerender(prev, next)).toBe(true);
  });

  it('re-renders when prefix match status changes', () => {
    const row = { entry: { normalized: 'абетка' }, display: 'АБЕТКА' };
    const prev = rowProps({ row, prefix: 'в' });
    const next = rowProps({ row, prefix: 'а' });
    expect(shouldSkipWordListRowRerender(prev, next)).toBe(false);
  });

  it('re-renders matching rows when the prefix changes', () => {
    const row = { entry: { normalized: 'абетка' }, display: 'АБЕТКА' };
    const prev = rowProps({ row, prefix: 'а' });
    const next = rowProps({ row, prefix: 'аб' });
    expect(shouldSkipWordListRowRerender(prev, next)).toBe(false);
  });

  it('re-renders when animateEntrance toggles', () => {
    const prev = rowProps({ animateEntrance: false });
    const next = rowProps({ animateEntrance: true });
    expect(shouldSkipWordListRowRerender(prev, next)).toBe(false);
  });
});
