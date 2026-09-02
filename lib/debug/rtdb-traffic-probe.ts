import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';
import { getAppTrafficBytes } from '@/modules/native-traffic-stats';
import type { ActionEntry, TrafficBucket } from './rtdb-diagnostics-types';

/** Traffic direction for diagnostics. */
export type TrafficDirection = 'down' | 'up';

/**
 * Simple estimation of JSON payload size in bytes.
 *
 * Returns 0 for `null` and `undefined` by design:
 * - A non-existent RTDB node (`snapshot.exists() === false`) has `val() === null`,
 *   and RTDB sends 0 payload bytes for absent nodes — recording 0 is correct.
 * - A live-listener snapshot where the server deleted the node between subscription
 *   and the first callback may also arrive as `val() === null`; we accept a minor
 *   under-count in that rare case rather than misreporting 4 bytes for `"null"`.
 */
export function utf8JsonBytes(value: unknown): number {
  // value is null when node doesn't exist; undefined is for internal guard.
  // RTDB sends 0 payload bytes for non-existent nodes.
  if (value === undefined || value === null) return 0;
  try {
    const str = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    // Fallback for environments without TextEncoder (older RN or non-Hermes)
    // encodeURIComponent + replace is a common trick to get UTF-8 byte length
    return encodeURIComponent(str).replace(/%[89ABab]/g, 'x').length;
  } catch {
    return 0;
  }
}

class RtdbTrafficProbe {
  private activeRoomId: string | null = null;
  private buckets: TrafficBucket[] = [];
  private actions: ActionEntry[] = [];
  private roomDownTotal = 0;
  private roomUpTotal = 0;
  private roomWireRxTotal = 0;
  private roomWireTxTotal = 0;

  private lastRxBytes = -1;
  private lastTxBytes = -1;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  // Listeners for UI updates (useSyncExternalStore style)
  private listeners: Set<() => void> = new Set();

  isCollecting(): boolean {
    const state = useRtdbDiagnosticsStore.getState();
    return state.developerModeEnabled && state.rtdbDiagnosticsEnabled;
  }

  /**
   * Start/stop wire polling when collecting toggles without a room change or
   * RTDB record (e.g. enable diagnostics while already in a room).
   */
  onCollectingChanged() {
    this.ensurePolling();
  }

  /**
   * Commit the active room into history when it has JSON and/or wire traffic.
   * Does not require `isCollecting()` — totals only grow while collecting, so
   * disable-then-flush still persists the session (ADR-025 flush-on-exit).
   */
  flushActiveRoom() {
    this.commitActiveRoomHistory();
    this.clearLiveRoomTotals();
    this.notify();
    this.ensurePolling();
  }

  setActiveRoomId(roomId: string | null) {
    if (this.activeRoomId === roomId) return;

    // Flush current room totals to history before switching (ADR-025 flush-on-exit).
    this.commitActiveRoomHistory();

    this.activeRoomId = roomId;
    this.clearLiveRoomTotals();

    // Reset baseline on room change to avoid huge deltas if polling was off
    this.lastRxBytes = -1;
    this.lastTxBytes = -1;

    this.notify();
    this.ensurePolling();
  }

  record(direction: TrafficDirection, bytes: number) {
    if (!this.isCollecting()) return;

    const tSec = Math.floor(Date.now() / 1000);
    const lastIdx = this.buckets.length - 1;
    let bucket: TrafficBucket | undefined = lastIdx >= 0 ? this.buckets[lastIdx] : undefined;

    if (!bucket || bucket.tSec !== tSec) {
      const newBucket: TrafficBucket = {
        tSec,
        downBytes: 0,
        upBytes: 0,
        wireRxBytes: 0,
        wireTxBytes: 0,
      };
      this.buckets.push(newBucket);
      bucket = newBucket;

      // Cap RAM buckets to ~1 hour (3600 seconds)
      if (this.buckets.length > 3600) {
        this.buckets.shift();
      }
    }

    if (direction === 'down') {
      bucket.downBytes += bytes;
      this.roomDownTotal += bytes;
    } else {
      bucket.upBytes += bytes;
      this.roomUpTotal += bytes;
    }

    this.notify();
    this.ensurePolling();
  }

  recordAction(entry: ActionEntry) {
    if (!this.isCollecting()) return;

    this.actions.push(entry);
    // Cap actions ring
    if (this.actions.length > 500) {
      this.actions.shift();
    }
    this.notify();
  }

  getLiveBuckets(): TrafficBucket[] {
    return this.buckets;
  }

  getRecentActions(count = 5): ActionEntry[] {
    return this.actions.slice(-count).reverse();
  }

  getRoomTotals() {
    return {
      roomId: this.activeRoomId,
      down: this.roomDownTotal,
      up: this.roomUpTotal,
      wireRx: this.roomWireRxTotal,
      wireTx: this.roomWireTxTotal,
    };
  }

  reset() {
    this.activeRoomId = null;
    this.clearLiveRoomTotals();
    this.lastRxBytes = -1;
    this.lastTxBytes = -1;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.notify();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private clearLiveRoomTotals() {
    this.roomDownTotal = 0;
    this.roomUpTotal = 0;
    this.roomWireRxTotal = 0;
    this.roomWireTxTotal = 0;
    this.buckets = [];
    this.actions = [];
  }

  private hasRoomTraffic(): boolean {
    return (
      this.roomDownTotal > 0 ||
      this.roomUpTotal > 0 ||
      this.roomWireRxTotal > 0 ||
      this.roomWireTxTotal > 0
    );
  }

  private commitActiveRoomHistory() {
    if (!this.activeRoomId || !this.hasRoomTraffic()) {
      return;
    }
    useRtdbDiagnosticsStore.getState().addHistoryEntry({
      roomId: this.activeRoomId,
      timestamp: Date.now(),
      downTotal: this.roomDownTotal,
      upTotal: this.roomUpTotal,
      wireRxTotal: this.roomWireRxTotal,
      wireTxTotal: this.roomWireTxTotal,
      buckets: this.buckets.slice(),
      actions: this.actions.slice(),
    });
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private ensurePolling() {
    if (!this.isCollecting()) {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
      return;
    }

    if (this.pollingTimer) return;

    this.pollingTimer = setInterval(() => {
      this.pollWireTraffic();
    }, 1000);
  }

  private pollWireTraffic() {
    // Self-stop: if diagnostics were disabled after the interval started, clear it here.
    // ensurePolling() also runs from setActiveRoomId / flush / onCollectingChanged.
    if (!this.isCollecting()) {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
      return;
    }

    try {
      const stats = getAppTrafficBytes();
      if (stats.rxBytes < 0 || stats.txBytes < 0) return;

      if (this.lastRxBytes >= 0 && this.lastTxBytes >= 0) {
        const rxDelta = stats.rxBytes - this.lastRxBytes;
        const txDelta = stats.txBytes - this.lastTxBytes;

        if (rxDelta > 0 || txDelta > 0) {
          const tSec = Math.floor(Date.now() / 1000);
          const lastIdx = this.buckets.length - 1;
          let bucket: TrafficBucket | undefined = lastIdx >= 0 ? this.buckets[lastIdx] : undefined;

          if (!bucket || bucket.tSec !== tSec) {
            const newBucket: TrafficBucket = {
              tSec,
              downBytes: 0,
              upBytes: 0,
              wireRxBytes: 0,
              wireTxBytes: 0,
            };
            this.buckets.push(newBucket);
            bucket = newBucket;
          }
          bucket.wireRxBytes = (bucket.wireRxBytes || 0) + rxDelta;
          bucket.wireTxBytes = (bucket.wireTxBytes || 0) + txDelta;
          this.roomWireRxTotal += rxDelta;
          this.roomWireTxTotal += txDelta;
          this.notify();
        }
      }

      this.lastRxBytes = stats.rxBytes;
      this.lastTxBytes = stats.txBytes;
    } catch {
      // Native module might not be linked yet or not available on web
    }
  }
}

export const rtdbTrafficProbe = new RtdbTrafficProbe();

// FIX: 2026-09 — disable diagnostics mid-room lost history → flush before collecting ends (ADR-025).
useRtdbDiagnosticsStore.subscribe((state, prev) => {
  const wasCollecting = prev.developerModeEnabled && prev.rtdbDiagnosticsEnabled;
  const nowCollecting = state.developerModeEnabled && state.rtdbDiagnosticsEnabled;
  if (wasCollecting && !nowCollecting) {
    rtdbTrafficProbe.flushActiveRoom();
  }
  if (wasCollecting !== nowCollecting) {
    rtdbTrafficProbe.onCollectingChanged();
  }
});
