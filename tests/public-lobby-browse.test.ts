import { describe, expect, it } from 'vitest';

import {
  browseRangeForPage,
  buildPageNumberWindow,
  totalPagesFromCount,
} from '../lib/online/public-lobby/browse-pagination.js';
import { PUBLIC_LOBBY_PAGE_SIZE } from '../lib/online/public-lobby/constants.js';

describe('buildPageNumberWindow', () => {
  it('returns empty for zero pages', () => {
    expect(buildPageNumberWindow(1, 0)).toEqual([]);
  });

  it('returns all pages when total is small', () => {
    expect(buildPageNumberWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('inserts ellipsis for large page counts', () => {
    expect(buildPageNumberWindow(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
  });
});

describe('totalPagesFromCount', () => {
  it('computes pages from count', () => {
    expect(totalPagesFromCount(41, PUBLIC_LOBBY_PAGE_SIZE)).toBe(3);
    expect(totalPagesFromCount(0)).toBe(0);
    expect(totalPagesFromCount(null)).toBe(null);
  });
});

describe('browseRangeForPage', () => {
  it('shows 1–20 on first page', () => {
    expect(browseRangeForPage(1, 20, 55, 20)).toEqual({ from: 1, to: 20 });
  });

  it('clamps last page range to total', () => {
    expect(browseRangeForPage(3, 20, 55, 15)).toEqual({ from: 41, to: 55 });
  });
});
