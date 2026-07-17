import { describe, expect, it } from 'vitest';

import type { ScoredWordEntry } from '@/lib/game/scoring';
import {
  buildSortedWordListRows,
  insertSortedWordListRow,
  wordListRenderExtraData,
  type WordListRow,
} from '@/lib/ui/word-list-rows';

function entry(normalized: string, badge: ScoredWordEntry['badge'] = null): ScoredWordEntry {
  return {
    normalized,
    kind: badge === 'x2' ? 'unique' : 'normal',
    points: badge === 'x2' ? 2 : 1,
    badge,
  };
}

function displayFor(normalized: string): string {
  return normalized.toLocaleUpperCase('uk');
}

describe('buildSortedWordListRows', () => {
  it('sorts alphabetically on a cold build', () => {
    const entries = [entry('вода'), entry('абетка'), entry('сік')];
    const displays = entries.map((e) => displayFor(e.normalized));
    const rows = buildSortedWordListRows(entries, displays, null);
    expect(rows.map((row) => row.entry.normalized)).toEqual(['абетка', 'вода', 'сік']);
  });

  it('reuses previous row object identity when inserting one new word', () => {
    const firstEntries = [entry('вода'), entry('абетка')];
    const firstDisplays = firstEntries.map((e) => displayFor(e.normalized));
    const previous = buildSortedWordListRows(firstEntries, firstDisplays, null);
    const abetka = previous.find((row) => row.entry.normalized === 'абетка');
    const voda = previous.find((row) => row.entry.normalized === 'вода');
    expect(abetka).toBeDefined();
    expect(voda).toBeDefined();

    const nextEntries = [entry('вода'), entry('абетка'), entry('сік')];
    const nextDisplays = nextEntries.map((e) => displayFor(e.normalized));
    const next = buildSortedWordListRows(nextEntries, nextDisplays, previous);

    expect(next.map((row) => row.entry.normalized)).toEqual(['абетка', 'вода', 'сік']);
    expect(next.find((row) => row.entry.normalized === 'абетка')).toBe(abetka);
    expect(next.find((row) => row.entry.normalized === 'вода')).toBe(voda);
    expect(next.find((row) => row.entry.normalized === 'сік')).not.toBeUndefined();
  });

  it('replaces only changed rows when badge updates', () => {
    const previousEntries = [entry('вода', 'x2'), entry('абетка')];
    const previousDisplays = previousEntries.map((e) => displayFor(e.normalized));
    const previous = buildSortedWordListRows(previousEntries, previousDisplays, null);
    const abetka = previous.find((row) => row.entry.normalized === 'абетка') as WordListRow;
    const voda = previous.find((row) => row.entry.normalized === 'вода') as WordListRow;

    const nextEntries = [entry('вода', '+1'), entry('абетка')];
    const nextDisplays = nextEntries.map((e) => displayFor(e.normalized));
    const next = buildSortedWordListRows(nextEntries, nextDisplays, previous);

    expect(next.find((row) => row.entry.normalized === 'абетка')).toBe(abetka);
    expect(next.find((row) => row.entry.normalized === 'вода')).not.toBe(voda);
    expect(next.find((row) => row.entry.normalized === 'вода')?.entry.badge).toBe('+1');
  });

  it('insertSortedWordListRow replaces an equal normalized key instead of duplicating', () => {
    const previous = buildSortedWordListRows(
      [entry('вода'), entry('абетка')],
      [displayFor('вода'), displayFor('абетка')],
      null,
    );
    const replacement = {
      key: 'вода-ВОДА',
      entry: entry('вода', 'x2'),
      display: displayFor('вода'),
    };
    const next = insertSortedWordListRow(previous, replacement);
    expect(next.map((row) => row.entry.normalized)).toEqual(['абетка', 'вода']);
    expect(next.find((row) => row.entry.normalized === 'вода')?.entry.badge).toBe('x2');
  });
});

describe('wordListRenderExtraData', () => {
  it('changes when prefix changes', () => {
    const a = wordListRenderExtraData('', new Set(), new Set());
    const b = wordListRenderExtraData('а', new Set(), new Set());
    expect(a).not.toBe(b);
  });

  it('changes when entrance or highlight sets change', () => {
    const empty = wordListRenderExtraData('а', new Set(), new Set());
    const entrance = wordListRenderExtraData('а', new Set(['вода']), new Set());
    const highlight = wordListRenderExtraData('а', new Set(), new Set(['вода']));
    expect(empty).not.toBe(entrance);
    expect(empty).not.toBe(highlight);
    expect(entrance).not.toBe(highlight);
  });

  it('is stable for equivalent sets regardless of insertion order', () => {
    const a = wordListRenderExtraData('а', new Set(['б', 'а']), new Set(['в']));
    const b = wordListRenderExtraData('а', new Set(['а', 'б']), new Set(['в']));
    expect(a).toBe(b);
  });
});
