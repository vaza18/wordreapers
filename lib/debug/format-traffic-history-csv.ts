import type { TrafficHistoryEntry } from './rtdb-diagnostics-types';

const CSV_HEADER =
  'iso_time,type,down_bytes,up_bytes,wire_rx_bytes,wire_tx_bytes,action,details,observed,room_id';

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return csvEscape(value);
}

/**
 * Builds a CSV string for one room history entry (traffic buckets + actions).
 * Newest timeline rows first — same order as the diagnostics detail screen.
 */
export function formatTrafficHistoryCsv(entry: TrafficHistoryEntry): string {
  type Row = {
    timestamp: number;
    type: 'traffic' | 'action';
    down?: number;
    up?: number;
    wireRx?: number;
    wireTx?: number;
    action?: string;
    details?: string | null;
    observed?: boolean;
  };

  const rows: Row[] = [];

  for (const b of entry.buckets) {
    if (
      b.downBytes > 0 ||
      b.upBytes > 0 ||
      (b.wireRxBytes != null && b.wireRxBytes > 0) ||
      (b.wireTxBytes != null && b.wireTxBytes > 0)
    ) {
      rows.push({
        timestamp: b.tSec * 1000,
        type: 'traffic',
        down: b.downBytes,
        up: b.upBytes,
        wireRx: b.wireRxBytes,
        wireTx: b.wireTxBytes,
      });
    }
  }

  for (const a of entry.actions) {
    rows.push({
      timestamp: a.timestamp,
      type: 'action',
      action: a.action,
      details: a.details,
      observed: a.observed,
    });
  }

  rows.sort((a, b) => b.timestamp - a.timestamp);

  const lines = rows.map((row) =>
    [
      cell(new Date(row.timestamp).toISOString()),
      cell(row.type),
      cell(row.type === 'traffic' ? (row.down ?? 0) : undefined),
      cell(row.type === 'traffic' ? (row.up ?? 0) : undefined),
      cell(row.type === 'traffic' ? row.wireRx : undefined),
      cell(row.type === 'traffic' ? row.wireTx : undefined),
      cell(row.action),
      cell(row.details ?? undefined),
      cell(row.observed ? true : undefined),
      cell(entry.roomId),
    ].join(','),
  );

  return [CSV_HEADER, ...lines].join('\n');
}
