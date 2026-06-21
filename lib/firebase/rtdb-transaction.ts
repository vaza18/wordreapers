import {
  get,
  runTransaction,
  type DatabaseReference,
  type TransactionResult,
} from 'firebase/database';

import { isFirebaseIgnorableRtdbError } from './rtdb-errors.js';

/**
 * Like `runTransaction`, but treats disconnect / conflict aborts as non-committed
 * instead of rejecting (Firebase RTDB throws on WebSocket loss).
 */
export async function runRtdbTransaction(
  ref: DatabaseReference,
  updateFunction: (current: unknown) => unknown,
): Promise<TransactionResult> {
  try {
    return await runTransaction(ref, updateFunction);
  } catch (error) {
    if (!isFirebaseIgnorableRtdbError(error)) {
      throw error;
    }
    try {
      const snapshot = await get(ref);
      return { committed: false, snapshot } as TransactionResult;
    } catch (getError) {
      if (isFirebaseIgnorableRtdbError(getError)) {
        return { committed: false } as TransactionResult;
      }
      throw getError;
    }
  }
}
