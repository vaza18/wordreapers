import { utf8JsonBytes, rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';

/** Duck-typed DataSnapshot for instrumentation avoid heavy circular peer deps. */
export interface InstrumentedSnapshot {
  val: () => unknown;
  exists?: () => boolean;
}

/** Record incoming RTDB data. Safe even if value is null/undefined. */
export function recordRtdbDown(value: unknown) {
  if (rtdbTrafficProbe.isCollecting()) {
    rtdbTrafficProbe.record('down', utf8JsonBytes(value));
  }
}

/**
 * Extract value from a snapshot and record download traffic.
 * Safe even if snapshot is null or lacks val().
 *
 * When `snapshot.exists() === false`, `snapshot.val()` returns `null`.
 * `utf8JsonBytes(null)` intentionally returns 0 — RTDB sends no payload
 * bytes for non-existent nodes, so 0 is the correct measurement.
 * See `utf8JsonBytes` in `rtdb-traffic-probe.ts` for the full rationale.
 *
 * When diagnostics are off, still returns `val()` for callers that need the
 * value — use {@link recordSnapshotTrafficIfCollecting} for exists-only paths
 * that must not deserialize when not collecting.
 */
export function instrumentedSnapshotVal<T = unknown>(snapshot: unknown): T {
  const s = snapshot as InstrumentedSnapshot | null | undefined;
  const val = (s && typeof s.val === 'function' ? s.val() : null) as T;
  recordRtdbDown(val);
  return val;
}

/**
 * Side-effect traffic record only. Skips `val()` entirely when not collecting
 * (e.g. {@link gameSessionExists} exists-only checks).
 */
export function recordSnapshotTrafficIfCollecting(snapshot: unknown): void {
  if (!rtdbTrafficProbe.isCollecting()) return;
  instrumentedSnapshotVal(snapshot);
}

/**
 * Word-maps listen-first (ADR-022): before authoritative seed, child callbacks
 * replay the same tree the seed `get` will count — skip instrumentation then.
 */
export function instrumentedChildSnapshotVal<T = unknown>(seeded: boolean, snapshot: unknown): T {
  if (!seeded) {
    const s = snapshot as InstrumentedSnapshot | null | undefined;
    return (s && typeof s.val === 'function' ? s.val() : null) as T;
  }
  return instrumentedSnapshotVal(snapshot);
}

/** Record outgoing RTDB data. */
export function recordRtdbUp(value: unknown) {
  if (!rtdbTrafficProbe.isCollecting()) return;
  const bytes = utf8JsonBytes(value);
  rtdbTrafficProbe.record('up', bytes);
}

/**
 * Record an RTDB `remove` / delete. Path length is a lower-bound marker —
 * `utf8JsonBytes(null)` is 0 and must not be used as a fake “removal” record.
 */
export function recordRtdbRemove(path: string) {
  if (!rtdbTrafficProbe.isCollecting()) return;
  rtdbTrafficProbe.record('up', Math.max(path.length, 1));
}

/** Record outgoing RTDB multi-path update. */
export function recordRtdbUpdate(updates: Record<string, unknown>) {
  if (!rtdbTrafficProbe.isCollecting()) return;
  let totalBytes = 0;
  for (const [key, val] of Object.entries(updates)) {
    // RTDB sends key length + value bytes
    totalBytes += key.length + utf8JsonBytes(val);
  }
  rtdbTrafficProbe.record('up', totalBytes);
}

/**
 * Record transaction commit (estimate).
 *
 * Warning: for read-modify-write transactions, the server receives the full
 * state as a single JSON object. This may double-count bytes already captured
 * in download measurement if the transaction root matches a previous `get()`.
 */
export function recordRtdbTransactionCommit(value: unknown) {
  if (!rtdbTrafficProbe.isCollecting()) return;
  rtdbTrafficProbe.record('up', utf8JsonBytes(value));
}
