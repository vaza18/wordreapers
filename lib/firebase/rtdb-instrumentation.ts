import { utf8JsonBytes, rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';

/** Duck-typed DataSnapshot for instrumentation avoid heavy circular peer deps. */
export interface InstrumentedSnapshot {
  val: () => unknown;
  exists?: () => boolean;
}

/** Read snapshot.val() without recording traffic. */
export function readSnapshotVal<T = unknown>(snapshot: unknown): T {
  const s = snapshot as InstrumentedSnapshot | null | undefined;
  return (s && typeof s.val === 'function' ? s.val() : null) as T;
}

/** Record incoming RTDB data. Safe even if value is null/undefined. */
export function recordRtdbDown(value: unknown, path?: string) {
  if (rtdbTrafficProbe.isCollecting()) {
    rtdbTrafficProbe.record('down', utf8JsonBytes(value), path);
  }
}

/** Record a pre-computed download byte count (e.g. session onValue deep delta). */
export function recordRtdbDownBytes(bytes: number, path?: string) {
  if (!rtdbTrafficProbe.isCollecting()) return;
  rtdbTrafficProbe.record('down', Math.max(0, bytes), path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Estimate JSON ↓ for a root `onValue` relative to the previous snapshot.
 * First event (`previous === undefined`) counts the full tree; later events
 * recurse so a finish leaf patch or `players/{uid}/online` flip is not billed
 * as a multi-KB re-download of unchanged siblings.
 */
export function deepChangedJsonBytes(previous: unknown, next: unknown): number {
  if (previous === undefined) {
    return utf8JsonBytes(next);
  }
  if (Object.is(previous, next)) {
    return 0;
  }
  const isPrevObj = isPlainObject(previous);
  const isNextObj = isPlainObject(next);

  if (!isPrevObj || !isNextObj) {
    // One or both are primitives or different types.
    // Optimization: JSON.stringify is fine for primitives or small values.
    try {
      if (JSON.stringify(previous) === JSON.stringify(next)) {
        return 0;
      }
    } catch {
      // Non-serializable → treat as changed.
    }
    return utf8JsonBytes(next);
  }

  const prevObj = previous;
  const nextObj = next;

  let bytes = 0;
  const nextKeys = Object.keys(nextObj);

  // Added or changed keys in next
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (key === undefined) continue;
    if (!Object.prototype.hasOwnProperty.call(prevObj, key)) {
      bytes += key.length + utf8JsonBytes(nextObj[key]);
    } else {
      const nested = deepChangedJsonBytes(prevObj[key], nextObj[key]);
      if (nested > 0) {
        bytes += key.length + nested;
      }
    }
  }

  // Removed keys (exist in previous but not in next)
  const prevKeys = Object.keys(prevObj);
  for (let i = 0; i < prevKeys.length; i++) {
    const key = prevKeys[i];
    if (key === undefined) continue;
    if (!Object.prototype.hasOwnProperty.call(nextObj, key)) {
      bytes += Math.max(key.length, 1);
    }
  }

  return bytes;
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
 *
 * Optional `path` tags large ↓ rows in the diagnostics timeline (finish/results dig).
 */
export function instrumentedSnapshotVal<T = unknown>(snapshot: unknown, path?: string): T {
  const val = readSnapshotVal<T>(snapshot);
  recordRtdbDown(val, path);
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
export function instrumentedChildSnapshotVal<T = unknown>(
  seeded: boolean,
  snapshot: unknown,
  path?: string,
): T {
  if (!seeded) {
    return readSnapshotVal(snapshot);
  }
  return instrumentedSnapshotVal(snapshot, path);
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
