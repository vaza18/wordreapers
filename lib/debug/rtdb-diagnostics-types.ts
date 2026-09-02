/** Data bucket for a specific second of traffic. */
export interface TrafficBucket {
  tSec: number;
  downBytes: number;
  upBytes: number;
  wireRxBytes?: number;
  wireTxBytes?: number;
}

/** Single user action or observed event. */
export interface ActionEntry {
  timestamp: number;
  action: string;
  details?: string | null;
  observed?: boolean;
}

/** Finalized traffic history for a game room. */
export interface TrafficHistoryEntry {
  roomId: string;
  timestamp: number;
  downTotal: number;
  upTotal: number;
  wireRxTotal?: number;
  wireTxTotal?: number;
  buckets: TrafficBucket[];
  actions: ActionEntry[];
}
