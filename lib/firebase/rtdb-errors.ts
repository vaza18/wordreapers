/** RTDB aborts in-flight transactions when the WebSocket drops or a conflicting write lands. */
export function isFirebaseTransactionAbort(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.trim().toLowerCase();
  // Firebase SDK uses `maxretry` (no trailing s); keep `maxretries` as a defensive alias.
  return (
    message === 'disconnect' ||
    message === 'set' ||
    message === 'maxretry' ||
    message === 'maxretries' ||
    message === 'overwrite'
  );
}

export function isFirebasePermissionDenied(error: unknown): boolean {
  if (typeof error === 'string') {
    return /permission[-_]?denied/i.test(error) || /doesn't have permission to access/i.test(error);
  }
  if (!(error instanceof Error) && typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'PERMISSION_DENIED' || code === 'permission-denied') {
      return true;
    }
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: string }).code;
  return (
    code === 'PERMISSION_DENIED' ||
    code === 'permission-denied' ||
    error.message.includes('Permission denied') ||
    /permission[-_]?denied/i.test(error.message) ||
    /doesn't have permission to access/i.test(error.message)
  );
}

/** Detect transient network / connectivity failures from Firebase or fetch. */
export function isFirebaseNetworkError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null
      : null;
  const text = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  return (
    code === 'auth/network-request-failed' ||
    code === 'unavailable' ||
    /network request failed/i.test(text) ||
    /\bNETWORK_ERROR\b/.test(text) ||
    /connection timed out/i.test(text) ||
    /failed to get/i.test(text) ||
    /offline/i.test(text)
  );
}

/** Errors that should not surface as uncaught promise rejections. */
export function isFirebaseIgnorableRtdbError(error: unknown): boolean {
  return isFirebasePermissionDenied(error) || isFirebaseTransactionAbort(error);
}
