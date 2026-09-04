import { describe, expect, it } from 'vitest';

import { formatTrafficHistoryCsv } from '../lib/debug/format-traffic-history-csv';
import type { TrafficHistoryEntry } from '../lib/debug/rtdb-diagnostics-types';

describe('formatTrafficHistoryCsv', () => {
  it('emits header and newest-first traffic + action rows with raw bytes', () => {
    const entry: TrafficHistoryEntry = {
      roomId: '7VH5Z',
      timestamp: 1_725_000_000_000,
      downTotal: 1638,
      upTotal: 47,
      wireRxTotal: 0,
      wireTxTotal: 0,
      buckets: [
        { tSec: 1_725_000_037, downBytes: 37, upBytes: 37 },
        { tSec: 1_725_000_032, downBytes: 1638, upBytes: 10, wireRxBytes: 0, wireTxBytes: 0 },
        { tSec: 1_725_000_001, downBytes: 0, upBytes: 0 },
      ],
      actions: [
        {
          timestamp: 1_725_000_002_000,
          action: 'started round',
          details: 'baseWord="житлоспілка", note="a,b"',
          observed: false,
        },
        {
          timestamp: 1_725_000_040_000,
          action: 'observed toast',
          details: null,
          observed: true,
        },
      ],
    };

    const csv = formatTrafficHistoryCsv(entry);
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'iso_time,type,down_bytes,up_bytes,wire_rx_bytes,wire_tx_bytes,action,details,observed,room_id',
    );
    expect(lines).toHaveLength(5); // header + 2 traffic + 2 actions (zero bucket skipped)

    expect(lines[1]).toBe(
      `${new Date(1_725_000_040_000).toISOString()},action,,,,,observed toast,,true,7VH5Z`,
    );
    expect(lines[2]).toBe(`${new Date(1_725_000_037_000).toISOString()},traffic,37,37,,,,,,7VH5Z`);
    expect(lines[3]).toBe(
      `${new Date(1_725_000_032_000).toISOString()},traffic,1638,10,0,0,,,,7VH5Z`,
    );
    expect(lines[4]).toBe(
      `${new Date(1_725_000_002_000).toISOString()},action,,,,,started round,"baseWord=""житлоспілка"", note=""a,b""",,7VH5Z`,
    );
  });

  it('returns header only when entry has no timeline rows', () => {
    const entry: TrafficHistoryEntry = {
      roomId: 'EMPTY',
      timestamp: 0,
      downTotal: 0,
      upTotal: 0,
      buckets: [],
      actions: [],
    };
    expect(formatTrafficHistoryCsv(entry)).toBe(
      'iso_time,type,down_bytes,up_bytes,wire_rx_bytes,wire_tx_bytes,action,details,observed,room_id',
    );
  });
});
