/**
 * Dev-only timing for online word submit (debounce → Firebase → UI).
 * Emits only when `EXPO_PUBLIC_LOG_LEVEL=all` (and `__DEV__`).
 */
import { devLog, isDevLogEnabled } from '../debug/dev-log.js';

export interface SubmitWordProfile {
  mark(label: string): void;
  finish(): void;
}

const SUBMIT_LATENCY_SUMMARY_EVERY = 10;
const submitLatencyTotals: number[] = [];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function logSubmitLatencySummary(): void {
  if (submitLatencyTotals.length === 0) {
    return;
  }
  const sorted = [...submitLatencyTotals].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  devLog(
    'all',
    `[submitWord latency] n=${sorted.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`,
  );
}

export function createSubmitWordProfile(normalized: string): SubmitWordProfile | null {
  if (!isDevLogEnabled('all')) {
    return null;
  }
  const startedAt = performance.now();
  let lastAt = startedAt;
  const segments: string[] = [];
  let finished = false;

  return {
    mark(label: string) {
      if (finished) {
        return;
      }
      const now = performance.now();
      segments.push(`${label} +${(now - lastAt).toFixed(1)}ms`);
      lastAt = now;
    },
    finish() {
      if (finished) {
        return;
      }
      finished = true;
      const totalMs = performance.now() - startedAt;
      devLog(
        'all',
        `[submitWord ${normalized}] total ${totalMs.toFixed(1)}ms ${segments.join(' | ')}`,
      );
      submitLatencyTotals.push(totalMs);
      if (submitLatencyTotals.length >= SUBMIT_LATENCY_SUMMARY_EVERY) {
        logSubmitLatencySummary();
        submitLatencyTotals.length = 0;
      }
    },
  };
}

/** Dev-only: log rolling submit latency summary (e.g. on app background). */
export function flushSubmitLatencySummary(): void {
  if (!isDevLogEnabled('all')) {
    return;
  }
  logSubmitLatencySummary();
  submitLatencyTotals.length = 0;
}
