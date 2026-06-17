export function isFirebasePermissionDenied(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: string }).code;
  return code === 'PERMISSION_DENIED' || error.message.includes('Permission denied');
}
