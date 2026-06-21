import { describe, expect, it } from 'vitest';

import {
  isFirebaseIgnorableRtdbError,
  isFirebasePermissionDenied,
  isFirebaseTransactionAbort,
} from '../rtdb-errors.js';

describe('isFirebaseTransactionAbort', () => {
  it('returns true for RTDB transaction abort messages', () => {
    expect(isFirebaseTransactionAbort(new Error('disconnect'))).toBe(true);
    expect(isFirebaseTransactionAbort(new Error('set'))).toBe(true);
    expect(isFirebaseTransactionAbort(new Error('maxretries'))).toBe(true);
    expect(isFirebaseTransactionAbort(new Error('overwrite'))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isFirebaseTransactionAbort(new Error('network'))).toBe(false);
    expect(isFirebaseTransactionAbort('disconnect')).toBe(false);
  });
});

describe('isFirebaseIgnorableRtdbError', () => {
  it('includes permission denied and transaction aborts', () => {
    const denied = new Error('Permission denied') as Error & { code: string };
    denied.code = 'PERMISSION_DENIED';
    expect(isFirebaseIgnorableRtdbError(denied)).toBe(true);
    expect(isFirebaseIgnorableRtdbError(new Error('disconnect'))).toBe(true);
    expect(isFirebaseIgnorableRtdbError(new Error('boom'))).toBe(false);
  });
});

describe('isFirebasePermissionDenied', () => {
  it('detects permission denied code and message', () => {
    const denied = new Error('x') as Error & { code: string };
    denied.code = 'PERMISSION_DENIED';
    expect(isFirebasePermissionDenied(denied)).toBe(true);
    expect(isFirebasePermissionDenied(new Error('Permission denied'))).toBe(true);
  });
});
