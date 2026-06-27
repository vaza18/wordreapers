/** RTDB aborts in-flight transactions when the WebSocket drops or a conflicting write lands. */
export function isFirebaseTransactionAbort(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  switch (error.message) {
    case 'disconnect':
    case 'set':
    case 'maxretries':
    case 'overwrite':
      return true;
    default:
      return false;
  }
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
    /doesn't have permission to access/i.test(error.message)
  );
}

/** Errors that should not surface as uncaught promise rejections. */
export function isFirebaseIgnorableRtdbError(error: unknown): boolean {
  return isFirebasePermissionDenied(error) || isFirebaseTransactionAbort(error);
}
