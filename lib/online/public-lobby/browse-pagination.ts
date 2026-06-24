import { PUBLIC_LOBBY_PAGE_SIZE } from './constants.js';

export type PageToken = number | 'ellipsis';

/**
 * Build compact page number strip: 1 2 3 … 20 with ellipsis when needed.
 */
export function buildPageNumberWindow(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 1) {
    return totalPages === 1 ? [1] : [];
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage]);
  if (currentPage > 1) {
    pages.add(currentPage - 1);
  }
  if (currentPage < totalPages) {
    pages.add(currentPage + 1);
  }
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: PageToken[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index];
    const prev = sorted[index - 1];
    if (page === undefined) {
      continue;
    }
    if (prev !== undefined && page - prev > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }
  return result;
}

export function totalPagesFromCount(
  total: number | null,
  pageSize = PUBLIC_LOBBY_PAGE_SIZE,
): number | null {
  if (total === null || total <= 0) {
    return total === 0 ? 0 : null;
  }
  return Math.ceil(total / pageSize);
}

export function browseRangeForPage(
  page: number,
  pageSize: number,
  total: number | null,
  rowCount: number,
): { from: number; to: number } {
  const from = (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + rowCount;
  if (total !== null && total > 0) {
    return { from: Math.min(from, total), to: Math.min(to, total) };
  }
  return { from, to };
}
