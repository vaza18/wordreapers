import * as Clipboard from 'expo-clipboard';

import { formatTrafficHistoryCsv } from './format-traffic-history-csv';
import type { TrafficHistoryEntry } from './rtdb-diagnostics-types';

/** Formats room timeline as CSV and writes it to the system clipboard. */
export async function copyTrafficHistoryCsv(entry: TrafficHistoryEntry): Promise<void> {
  await Clipboard.setStringAsync(formatTrafficHistoryCsv(entry));
}
