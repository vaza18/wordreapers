import { describe, expect, it } from 'vitest';

import {
  formatArchiveDateRange,
  formatArchiveSavedAt,
  formatRoomHistoryDateRange,
} from '@/lib/online/format-archive-date';

describe('formatArchiveDateRange', () => {
  it('shows date with time range on the same calendar day', () => {
    const oldest = Date.UTC(2026, 5, 24, 12, 30);
    const newest = Date.UTC(2026, 5, 24, 18, 45);
    const formatted = formatArchiveDateRange(oldest, newest, 'uk-UA');
    expect(formatted).toContain('24');
    expect(formatted).toContain('–');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('shows day range without time across different days', () => {
    const oldest = Date.UTC(2026, 5, 24, 12, 30);
    const newest = Date.UTC(2026, 5, 26, 18, 45);
    const formatted = formatArchiveDateRange(oldest, newest, 'uk-UA');
    expect(formatted).toMatch(/24\s*–\s*26/);
    expect(formatted).not.toMatch(/\d{2}:\d{2}/);
  });

  it('matches single timestamp formatting for one instant', () => {
    const ts = Date.UTC(2026, 5, 24, 14, 30);
    expect(formatArchiveDateRange(ts, ts, 'uk-UA')).toBe(formatArchiveSavedAt(ts, 'uk-UA'));
  });
});

describe('formatRoomHistoryDateRange', () => {
  it('shows long month date with time range on the same calendar day', () => {
    const oldest = Date.UTC(2026, 5, 26, 11, 55);
    const newest = Date.UTC(2026, 5, 26, 13, 32);
    const formatted = formatRoomHistoryDateRange(oldest, newest, 'uk-UA');
    expect(formatted).toContain('26');
    expect(formatted).toContain(' - ');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('shows full date/time on both ends across different days', () => {
    const oldest = Date.UTC(2026, 5, 24, 12, 30);
    const newest = Date.UTC(2026, 5, 26, 18, 45);
    const formatted = formatRoomHistoryDateRange(oldest, newest, 'uk-UA');
    expect(formatted).toContain(' - ');
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('shows a single date/time for one instant', () => {
    const ts = Date.UTC(2026, 5, 26, 11, 55);
    const formatted = formatRoomHistoryDateRange(ts, ts, 'uk-UA');
    expect(formatted).toContain('26');
    expect(formatted).not.toContain(' - ');
  });
});
