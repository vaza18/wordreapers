import {
  get,
  runTransaction,
  type DatabaseReference,
  type TransactionResult,
} from 'firebase/database';

import { isFirebaseIgnorableRtdbError } from './rtdb-errors.js';
import {
  instrumentedSnapshotVal,
  recordRtdbTransactionCommit,
  recordRtdbDown,
} from './rtdb-instrumentation.js';

/**
 * Like `runTransaction`, but treats disconnect / conflict aborts as non-committed
 * instead of rejecting (Firebase RTDB throws on WebSocket loss).
 */
export async function runRtdbTransaction(
  ref: DatabaseReference,
  updateFunction: (current: unknown) => unknown,
  options?: { applyLocally?: boolean },
): Promise<TransactionResult> {
  try {
    const result = await runTransaction(
      ref,
      (current) => {
        // FIX: 2026-09 — record transaction "down" bytes (the initial value)
        // so we can see the download cost of transactions in the probe.
        recordRtdbDown(current, `${ref.toString()} (transaction seed)`);
        return updateFunction(current);
      },
      options,
    );

    if (result.committed && result.snapshot && typeof result.snapshot.val === 'function') {
      // Note: records the full snapshot as an upload (up).
      recordRtdbTransactionCommit(result.snapshot.val());
    }
    return result;
  } catch (error) {
    if (!isFirebaseIgnorableRtdbError(error)) {
      throw error;
    }
    try {
      const snapshot = await get(ref);
      instrumentedSnapshotVal(snapshot);
      return { committed: false, snapshot } as TransactionResult;
    } catch (getError) {
      if (isFirebaseIgnorableRtdbError(getError)) {
        return { committed: false } as TransactionResult;
      }
      throw getError;
    }
  }
}
