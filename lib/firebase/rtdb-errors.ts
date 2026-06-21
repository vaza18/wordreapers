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
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: string }).code;
  return code === 'PERMISSION_DENIED' || error.message.includes('Permission denied');
}

/** Errors that should not surface as uncaught promise rejections. */
export function isFirebaseIgnorableRtdbError(error: unknown): boolean {
  return isFirebasePermissionDenied(error) || isFirebaseTransactionAbort(error);
}
